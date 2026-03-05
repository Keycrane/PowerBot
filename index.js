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
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
                console.log(`Locked ${channel.name}`);
                isLocked = true;

                slowChannels.forEach(id => {
                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
                });
            }

            if (!recoveryTimeout) {
                recoveryTimeout = setTimeout(async () => {
                    power += recoveryAmount;
                    if (power > maxPower) power = maxPower;

                    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
                    console.log(`Unlocked ${channel.name} after recovery`);
                    isLocked = false;

                    slowChannels.forEach(id => {
                        const ch = client.channels.cache.get(id);
                        if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
                    });

                    await updatePowerMessage();
                    recoveryTimeout = null;
                }, recoveryDelay);
            }
        }
        // UNLOCK IF POWER RETURNS
        else if (power > 0 && isLocked) {
            await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
            console.log(`Unlocked ${channel.name}`);
            isLocked = false;

            slowChannels.forEach(id => {
                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
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

// ----- Message Log + Random Power System with Criticals -----
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || msg.channel.id !== powerChannelId) return;

    try {
        const originalMessage = msg.content;
        await msg.delete().catch(()=>{});

        let powerChange;
        let resultText;

        const roll = Math.random();
        const criticalFailureChance = 0.01; // 1%
        const criticalSuccessChance = 0.01; // 1%

        if (roll < criticalFailureChance) {
            // Extreme Critical Failure
            powerChange = -Math.floor(Math.random() * 26) - 50; // -50 to -75
            power += powerChange;
            if (power < 0) power = 0;

            resultText = "***!!!C41TICAL SY1T3M F4ILU4E!!!***\n*Y0U A43 S0 !$!#$#*\n!@#$% **S010E1** M101D00N\n101 M101L1S 11F10NE\n***REB001 R100IR1D!***\n W13\n *W03*\n **W10**\n ***031***\n ***113***\n **0H3**";

        } else if (roll > 1 - criticalSuccessChance) {
            // Extreme Critical Success
            powerChange = Math.floor(Math.random() * 26) + 50; // +50 to +75
            power += powerChange;
            if (power > maxPower) power = maxPower;

            resultText = "**!!!CRITICAL REPAIR SUCCESS!!!**\nSYSTEM STABILIZED!\nPOWER SURGE BOOST!\nYOU ARE MY FAVORITE *FLESHBAG*!!! HAVE THIS PRESENT :D";

        } else if (roll < 0.15) {
            // Normal Failure
            powerChange = -(Math.floor(Math.random() * 11) + 5); // -5 to -15
            power += powerChange;
            if (power < 0) power = 0;

            const damage = Math.abs(powerChange);
            if (damage <= 7)
                resultText = "**Idiot detected:**\nMinor damage caused.";
            else if (damage <= 11)
                resultText = "***3RR0R:***\nS3RI0US D4MAG3 D3TECT3D. 5EnD R3AL M4INT3N4NC3-";
            else
                resultText = "***?!!15STEM M3L354CTI20.\n57ITI231 3A38U8E!!?***";

        } else {
            // Normal Success
            powerChange = Math.floor(Math.random() * 16) + 5; // +5 to +20
            power += powerChange;
            if (power > maxPower) power = maxPower;

            if (powerChange <= 6)
                resultText = "Minor repair completed.\nDuctTape detected.";
            else if (powerChange <= 14)
                resultText = "System stabilization successful.\nMechanical services exceptional";
            else
                resultText = "Critical repair successful!\nThank you.";
        }

        // Delete previous log
        if (lastLogMessage) {
            await lastLogMessage.delete().catch(()=>{});
        }

        // Send new log
        lastLogMessage = await channel.send(
`POWER GRID TERMINAL
-------------------------

Operator: ${msg.author.username}

Notes:
"${originalMessage}"

Result:
${resultText}

Power Change: ${powerChange > 0 ? '+' : ''}${powerChange}%`
        );

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
