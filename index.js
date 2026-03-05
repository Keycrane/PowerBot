// ----- Required Modules -----
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ----- Bot Setup -----
const TOKEN = process.env.TOKEN;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

// ----- Configuration -----
let power = 100;
const maxPower = 100;
const powerDecay = 1;
const intervalMs = 20000;
const recoveryAmount = 65;
const recoveryDelay = 10000;
const powerChannelId = '1017667058261041274';
const slowChannels = ['1029276114641756251','1034745617399943178','1207493500929835048'];

let powerMessage;
let lastLogMessage = null;
let isLocked = false;
let recoveryTimeout = null;

// ----- Update Power Bar Message -----
async function updatePowerMessage() {
    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || !channel.isTextBased()) return;

    const barLength = 20;
    const filled = Math.max(0, Math.floor((power / maxPower) * barLength));
    const empty = barLength - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if (!powerMessage) {
        powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
    } else {
        await powerMessage.edit(`Power: ${bar} (${power}%)`);
    }
}

// ----- Power Interval (with Recovery Logic) -----
setInterval(async () => {
    try {

        const channel = client.channels.cache.get(powerChannelId);
        if (!channel || !channel.isTextBased()) return;

        // Decrease power
        if (power > 0) {
            power -= powerDecay;
            if (power < 0) power = 0;
        }

        await updatePowerMessage();

        // LOCK CHANNEL
        if (power === 0) {

            if (!isLocked) {

                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone,
                    { SendMessages: false }
                );

                console.log(`Locked ${channel.name}`);
                isLocked = true;

                slowChannels.forEach(id => {
                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased())
                        ch.setRateLimitPerUser(10).catch(console.error);
                });

            }

            if (!recoveryTimeout) {

                recoveryTimeout = setTimeout(async () => {

                    power += recoveryAmount;
                    if (power > maxPower) power = maxPower;

                    await channel.permissionOverwrites.edit(
                        channel.guild.roles.everyone,
                        { SendMessages: true }
                    );

                    console.log(`Unlocked ${channel.name} after recovery`);
                    isLocked = false;

                    slowChannels.forEach(id => {
                        const ch = client.channels.cache.get(id);
                        if (ch && ch.isTextBased())
                            ch.setRateLimitPerUser(0).catch(console.error);
                    });

                    await updatePowerMessage();

                    recoveryTimeout = null;

                }, recoveryDelay);

            }

        }

        // UNLOCK IF POWER RETURNS
        else if (power > 0 && isLocked) {

            await channel.permissionOverwrites.edit(
                channel.guild.roles.everyone,
                { SendMessages: true }
            );

            console.log(`Unlocked ${channel.name}`);
            isLocked = false;

            slowChannels.forEach(id => {
                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased())
                    ch.setRateLimitPerUser(0).catch(console.error);
            });

            if (recoveryTimeout) {
                clearTimeout(recoveryTimeout);
                recoveryTimeout = null;
            }

        }

    } catch (err) {
        console.error('Error in power interval:', err);
    }

}, intervalMs);

// ----- Message Log + Power Increase -----
client.on('messageCreate', async msg => {

    if (msg.author.bot) return;

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || msg.channel.id !== powerChannelId) return;

    try {

        // Delete user message
        await msg.delete().catch(()=>{});

        // Increase power
        power += 20;
        if (power > maxPower) power = maxPower;

        // Delete previous log
        if (lastLogMessage) {
            await lastLogMessage.delete().catch(()=>{});
        }

        // Create new log
        lastLogMessage = await channel.send(
`POWER GRID TERMINAL
-------------------------

Operator: ${msg.author.username}

Notes:
"${msg.content}"

Result:
+20% system power restored.`
        );

        // Update power bar instantly
        await updatePowerMessage();

    } catch (err) {
        console.error("Log system error:", err);
    }

});

// ----- Keep-Alive Server -----
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Web server running on port ${PORT}`));

// ----- Error Handling -----
process.on('unhandledRejection', err => console.error('Unhandled promise rejection:', err));
process.on('uncaughtException', err => console.error('Uncaught exception:', err));

// ----- Login Bot -----
client.once('ready', () => {

    console.log(`Logged in as ${client.user.tag}`);

    updatePowerMessage();

});

client.login(TOKEN);
