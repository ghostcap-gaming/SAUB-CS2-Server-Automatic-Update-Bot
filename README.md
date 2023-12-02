# SAUB - CS2 Server Automatic Update Bot for Pterodactyl & WISP

![Counter Strike 2 Update Bot](https://i.imgur.com/7CfFMK2.png)

SAUB is a bot automates the update process for Counter Strike 2 servers running on Pterodactyl or WISP. It checks Steam every 2 minutes for game updates, notifies the players in game and then restarts already running servers ensuring that your game servers are always up-to-date with the latest patches. Using the included egg you can get the bot setup in just a few minutes with 0 coding knowledge.

I originally created this for my own community and clients of [Game Host Bros](https://www.gamehostbros.com/) but I thought It would be valuable to lots of other communtites. There are other alternatives such as [this CounterStrikeSharp plugin](https://github.com/dran1x/CS2-AutoUpdater), but I wanted something that could run on both modded and vanilla servers. The exact method we use to check Steam is what we used to auto update our CSGO servers in the past and it was extremly reliable for us.

## Features

- **Automated Update Checks**: The bot periodically checks every 5 minutes for updates to Counter Strike 2 via the Steam API.
- **Restart on Update**: Automatically restarts servers when a new update is detected. (Ignoring servers that are turned off)
- **Supports Multiple Servers**: Control 1 or 100 servers, it doesn't make a difference.
- **Pre-Restart Notifications**: Sends customizable messages (twice so players don't miss it) to the game server before restarting, notifying players of impending updates.
- **Discord Webhook Integration**: Sends notifications to a specified Discord channel about updates and server restarts.
- **Server UUID Verification**: Validates the existence and status of servers before attempting to send commands or restart.
- **Configurable via Startup Variables**: All settings are configurable through startup variables in Pterodactyl and WISP, eliminating the need for manual configuration file edits.
- **Error Handling and Logging**: Provides detailed logs and handles errors gracefully, ensuring smooth operation.

## Installation

1. Import the provided egg JSON file into your Pterodactyl or WISP panel.
2. Create a new server using the imported egg.
3. Configure the server's startup variables.

- Steam API Key: Get your Steam API key from here - https://steamcommunity.com/dev/apikey
- Panel Client API Key: You can this from your user profile page in Pterodactyl or WISP.
- CS2 Server UUIDs: Seperate them using a comma. It should look like this: 79ec9628,45a32c57,85765369.
- Discord Webhook (Optional): Create a webhook to notify the channel if an update comes out and what servers were restarted
- Panel Domain: The URL should look like this - https://panel.gamehostbros.com - Make sure there is no trailing slash on the domain.
- Panel Type: Using the drop down select either PTERODACTL or WISP.

 > [!IMPORTANT]  
 > I suggest you install this using 1 server UUID first as it will generate a .json file with the most recent update and trigger a restart on that server.

## Usage

Once configured, you simply leave the bot running. It will periodically check every ~2 minutes for Counter Strike 2 updates and perform restarts as needed. Please not that it doesnt update on every change that Valve releases for CS2, only the ones that will stop players connecting to your server.

## Known Issues

None

## Support

This bot is still a work in progress. Please open an issue if you find a bug. I'm open to contributions on the project but only to enhance existing features or updates as I want to keep it simple for people to use.
