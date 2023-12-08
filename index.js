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
  panelApiKey: credentials.PANEL_API_KEY,
  serverUuids: credentials.SERVER_UUIDS.split(','),
  discordWebhookUrl: credentials.DISCORD_WEBHOOK_URL,
  panelDomain: credentials.PANEL_DOMAIN,
  panelType: credentials.PANEL_TYPE,
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
    const steamApiResponse = await axios.get(`http://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=730&count=1&maxlength=300&format=json&key=${config.steamApiKey}`);
    if (!steamApiResponse.data.appnews || steamApiResponse.data.appnews.newsitems.length === 0) {
      throw new Error('Failed to get a response from Steam News API. Please check the Steam API key.');
    }

    for (const serverUuid of config.serverUuids) {
      try {
        let headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.panelApiKey}`,
        };

        if (config.panelType === 'WISP') {
          headers['Accept'] = 'application/vnd.wisp.v1+json';
        } else if (config.panelType === 'PTERODACTYL') {
          headers['Accept'] = 'application/json';
        }

        await axios.get(`${config.panelDomain}/api/client/servers/${serverUuid}/resources`, { headers });
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
  }, 100000);
}

async function checkForSteamUpdates() {
  try {
    const response = await axios.get('https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=730&count=3&maxlength=300&format=json');
    const newsItems = response.data.appnews.newsitems;

    if (newsItems.length > 0) {
      newsItems.sort((a, b) => b.date - a.date);
      const newestItem = newsItems[0];

      if (newestItem.gid !== latestNewsId && newestItem.date > latestNewsDate && newestItem.tags.includes('patchnotes')) {
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
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.panelApiKey}`,
  };

  if (config.panelType === 'WISP') {
    headers['Accept'] = 'application/vnd.wisp.v1+json';
  } else if (config.panelType === 'PTERODACTYL') {
    headers['Accept'] = 'application/json';
  }

  try {
    const powerStatusResponse = await axios.get(`${config.panelDomain}/api/client/servers/${serverUuid}/resources`, { headers });

    let isServerRunning = false;
    if (config.panelType === 'WISP') {
      isServerRunning = powerStatusResponse.data.status === 1;
    } else if (config.panelType === 'PTERODACTYL') {
      isServerRunning = powerStatusResponse.data.attributes.current_state === "running";
    }

    if (isServerRunning) {
      await axios.post(`${config.panelDomain}/api/client/servers/${serverUuid}/power`, {
        signal: 'restart',
      }, { headers });

    }
  } catch (error) {
    console.error(`Error restarting server with UUID ${serverUuid}:`, error.message);
  }
}

let serversRestartedForCurrentUpdate = new Set();

async function performSteamUpdateChecks() {
  const updateDetected = await checkForSteamUpdates();
  if (updateDetected) {
    let serversToRestart = [];

    for (const serverUuid of config.serverUuids) {
      if (serversRestartedForCurrentUpdate.has(serverUuid)) {
        console.log(`Server ${serverUuid} already restarted for this update. Skipping.`);
        continue;
      }

      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.panelApiKey}`,
      };

      if (config.panelType === 'WISP') {
        headers['Accept'] = 'application/vnd.wisp.v1+json';
      } else if (config.panelType === 'PTERODACTYL') {
        headers['Accept'] = 'application/json';
      }

      try {
        const powerStatusResponse = await axios.get(`${config.panelDomain}/api/client/servers/${serverUuid}/resources`, { headers });

        let isServerRunning = false;
        if (config.panelType === 'WISP') {
          isServerRunning = powerStatusResponse.data.status === 1;
        } else if (config.panelType === 'PTERODACTYL') {
          isServerRunning = powerStatusResponse.data.attributes.current_state === "running";
        }

        if (isServerRunning) {
          await sendServerCommand(serverUuid, "say CS2 HAS JUST UPDATED, PLEASE REJOIN THE SERVER!");
          serversToRestart.push(serverUuid);
        }
      } catch (error) {
        console.error(`Error checking server state for UUID ${serverUuid}: ${error.message}`);
      }
    }

    if (serversToRestart.length > 0) {
      let updatingServers = serversToRestart.join(', ');
      await sendDiscordWebhook(`Steam update detected. Restarting servers: ${updatingServers}.`);

      for (const serverUuid of serversToRestart) {
        await restartServer(serverUuid);
        serversRestartedForCurrentUpdate.add(serverUuid);
      }

      console.log(`All servers have been restarted for the update. Servers restarted: ${updatingServers}.`);
    } else {
      await sendDiscordWebhook(`Steam update detected. No servers currently running to restart.`);
      console.log(`Steam update detected, but no servers are currently running to restart.`);
    }
  } else {
    serversRestartedForCurrentUpdate.clear();
  }
}

async function sendServerCommand(serverUuid, command) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${config.panelApiKey}`,
  };

  if (config.panelType === 'WISP') {
    headers['Accept'] = 'application/vnd.wisp.v1+json';
  } else if (config.panelType === 'PTERODACTYL') {
    headers['Accept'] = 'application/json';
  }

  const commandUrl = `${config.panelDomain}/api/client/servers/${serverUuid}/command`;
  const data = { command };

  try {
    const delay = ms => new Promise(res => setTimeout(res, ms));
    await delay(2000);

    const response = await axios.post(commandUrl, data, { headers });
    if (response.status === 204) {
      console.log(`Command sent to server ${serverUuid}: ${command}`);
    } else {
      console.log(`Failed to send command to server ${serverUuid}. Status: ${response.status}`);
    }
  } catch (error) {
    console.error(`Error sending command to server ${serverUuid}:`, error.message);
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