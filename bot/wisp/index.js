const axios = require('axios');
const fs = require('fs');

function readCredentials(file) {
  const credentials = {};
  const fileContent = fs.readFileSync(file, 'utf-8');
  fileContent.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length === 2) {
      const key = parts[0].trim();
      let value = parts[1].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      }
      credentials[key] = value;
    }
  });
  return credentials;
}

const credentials = readCredentials('credentials.cfg');
const config = {
  steamApiKey: credentials.STEAM_API_KEY,
  panelApiKey: credentials.PANEL_API_KEY,
  serverUuids: credentials.SERVER_UUIDS.split(','),
  discordWebhookUrl: credentials.DISCORD_WEBHOOK_URL,
  panelDomain: credentials.PANEL_DOMAIN,
};

let latestNewsId = '';
let latestNewsDate = 0;

try {
  if (!fs.existsSync('latestNewsId.json')) {
    fs.writeFileSync('latestNewsId.json', JSON.stringify({ latestNewsId: '', latestNewsDate: 0 }));
  }
  const data = fs.readFileSync('latestNewsId.json', 'utf-8');
  if (data) {
    const jsonData = JSON.parse(data);
    latestNewsId = jsonData.latestNewsId || '';
    latestNewsDate = jsonData.latestNewsDate || 0;
  }
} catch (error) {
  console.error('Error handling latestNewsId.json:', error);
}

async function initialChecks() {
  console.log('Performing initial checks...');

  let failedUuids = [];

  try {
    const steamApiResponse = await axios.get('http://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=730&count=1&maxlength=300&format=json');
    if (!steamApiResponse.data.appnews || steamApiResponse.data.appnews.newsitems.length === 0) {
      throw new Error('No response from Steam News API.');
    }

    for (const serverUuid of config.serverUuids) {
      try {
        await axios.get(`${config.panelDomain}/api/client/servers/${serverUuid}/resources`, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.wisp.v1+json',
            'Authorization': `Bearer ${config.panelApiKey}`,
          },
        });
      } catch (error) {
        console.error(`Error querying server with UUID ${serverUuid}:`, error.message);
        failedUuids.push(serverUuid);
      }
    }

    if (failedUuids.length > 0) {
      console.warn(`Initial check: Unable to query the following server UUIDs: ${failedUuids.join(', ')}.`);
    } else {
      console.log('All server UUIDs successfully queried.');
    }

    console.log('Initial checks passed.');
    return true;
  } catch (error) {
    console.error('Critical initial check failed:', error.message);
    return false;
  }
}

async function startApplication() {
  const checksPassed = await initialChecks();
  if (!checksPassed) {
    console.error('Application will not start due to failed initial checks.');
    return;
  }

  console.log('Started. Waiting to detect updates');
  performSteamUpdateChecks();

  setInterval(async () => {
    console.log('Checking for Steam updates...');
    await performSteamUpdateChecks();
    console.log('Steam update check complete.');
  }, 300000);
}

async function checkForSteamUpdates() {
  try {
    const response = await axios.get('http://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=730&count=3&maxlength=300&format=json');
    const newsItems = response.data.appnews.newsitems;

    if (newsItems.length > 0) {
      const newestItem = newsItems[0];

      if ((newestItem.gid !== latestNewsId || newestItem.date > latestNewsDate) && newestItem.tags.includes('patchnotes')) {
        latestNewsId = newestItem.gid;
        latestNewsDate = newestItem.date;

        try {
          fs.writeFileSync('latestNewsId.json', JSON.stringify({ latestNewsId, latestNewsDate }));
        } catch (writeError) {
          console.error('Error writing to latestNewsId.json:', writeError);
        }
        return true;
      }
    }
    return false;
  } catch (error) {
    console.error('Error checking for updates:', error);
    return false;
  }
}

async function restartServer(serverUuid) {
  try {
    const powerStatusResponse = await axios.get(`${config.panelDomain}/api/client/servers/${serverUuid}/resources`, {
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.wisp.v1+json',
        'Authorization': `Bearer ${config.panelApiKey}`,
      },
    });

    const powerStatus = powerStatusResponse.data.status;

    if (powerStatus === 1) {
      await axios.post(`${config.panelDomain}/api/client/servers/${serverUuid}/power`, {
        signal: 'restart',
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.wisp.v1+json',
          'Authorization': `Bearer ${config.panelApiKey}`,
        },
      });

      console.log(`Restart command sent to server with UUID: ${serverUuid}`);
    } else {
      console.log(`Server with UUID: ${serverUuid} is not running. No restart command sent.`);
    }
  } catch (error) {
    console.error(`Error restarting server with UUID ${serverUuid}:`, error);
  }
}

async function performSteamUpdateChecks() {
  const updateDetected = await checkForSteamUpdates();
  if (updateDetected) {
    let serversToRestart = [];

    for (const serverUuid of config.serverUuids) {
      const powerStatusResponse = await axios.get(`${config.panelDomain}/api/client/servers/${serverUuid}/resources`, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.wisp.v1+json',
          'Authorization': `Bearer ${config.panelApiKey}`,
        },
      });

      if (powerStatusResponse.data.status === 1) {
        await sendServerCommand(serverUuid, "say CS2 HAS JUST UPDATED, PLEASE REJOIN THE SERVER!");
        serversToRestart.push(serverUuid);
      }
    }

    if (serversToRestart.length > 0) {
      let updatingServers = serversToRestart.join(', ');
      await sendDiscordWebhook(`Steam update detected. Restarting servers: ${updatingServers}.`);

      for (const serverUuid of serversToRestart) {
        await restartServer(serverUuid);
        console.log(`Steam update detected, restart command sent to server: ${serverUuid}`);
      }
    } else {
      await sendDiscordWebhook(`Steam update detected. No servers currently running to restart.`);
      console.log(`Steam update detected, but no servers are currently running to restart.`);
    }
  }
}

async function sendServerCommand(serverUuid, command) {
  const commandUrl = `${config.panelDomain}/api/client/servers/${serverUuid}/command`;
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.wisp.v1+json',
    'Authorization': `Bearer ${config.panelApiKey}`,
  };
  const data = { command };

  for (let i = 0; i < 2; i++) {
    try {
      const response = await axios.post(commandUrl, data, { headers });
      if (response.status === 204) {
        console.log(`Command sent to server ${serverUuid}: ${command}`);
      } else {
        console.log(`Failed to send command to server ${serverUuid}. Status: ${response.status}`);
      }
    } catch (error) {
      console.error(`Error sending command to server ${serverUuid}:`, error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

async function sendDiscordWebhook(message) {
  if (!config.discordWebhookUrl) {
    return;
  }

  try {
    await axios.post(config.discordWebhookUrl, {
      embeds: [{ description: message }]
    });
  } catch (error) {
    console.error('Error sending Discord webhook:', error.message);
  }
}

startApplication();