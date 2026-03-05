// ----- Required Modules -----
require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const express = require('express');

// ----- Bot Setup -----
const TOKEN = process.env.TOKEN;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ----- Configuration -----
let power = 100;
const maxPower = 100;
const powerDecay = 1;
const intervalMs = 20000;
const recoveryAmount = 65;
const recoveryDelay = 10000;

const missingRoleId = '1479226262756261938';
let missingUserId = null;

const criticalSuccessRoleId = '1479223982900379780';
const criticalFailureRoleId = '1479223995277775012';

const powerChannelId = '1017667058261041274';
const slowChannels = [
    '1029276114641756251',
    '1034745617399943178',
    '1207493500929835048'
];

let powerMessage;
let lastLogMessage = null;
let isLocked = false;
let recoveryTimeout = null;

// ----- Update Power Bar -----
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

        if (power === 0) {
            if (!isLocked) {
                // Lock channel
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
                console.log(`Locked ${channel.name}`);
                isLocked = true;

                // Apply slowmode
                slowChannels.forEach(id => {
                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
                });

                // Give "Missing" role to the last user who caused power to drop
                if (lastLogMessage) {
                    const member = await channel.guild.members.fetch(lastLogMessage.author.id).catch(()=>null);
                    const role = channel.guild.roles.cache.get(missingRoleId);
                    if (member && role) {
                        member.roles.add(role).catch(console.error);
                        missingUserId = member.id;
                    }
                }
            }

            // Start recovery timeout
            if (!recoveryTimeout) {
                recoveryTimeout = setTimeout(async () => {
                    power += recoveryAmount;
                    if (power > maxPower) power = maxPower;

                    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
                    console.log(`Unlocked ${channel.name} after recovery`);
                    isLocked = false;

                    // Reset slowmode
                    slowChannels.forEach(id => {
                        const ch = client.channels.cache.get(id);
                        if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
                    });

                    // Remove "Missing" role from user
                    if (missingUserId) {
                        const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                        const role = channel.guild.roles.cache.get(missingRoleId);
                        if (member && role) member.roles.remove(role).catch(console.error);
                        missingUserId = null;
                    }

                    await updatePowerMessage();
                    recoveryTimeout = null;
                }, recoveryDelay);
            }
        } else if (power > 0 && isLocked) {
            // Unlock channel if power returns
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

            // Remove "Missing" role if still applied
            if (missingUserId) {
                const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                const role = channel.guild.roles.cache.get(missingRoleId);
                if (member && role) member.roles.remove(role).catch(console.error);
                missingUserId = null;
            }
        }

    } catch (err) {
        console.error('Error in power interval:', err);
    }
}, intervalMs);

// ----- Message Log + Random Power System -----
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
        const criticalFailureChance = 0.01;
        const criticalSuccessChance = 0.01;

        if (roll < criticalFailureChance) {
            powerChange = -Math.floor(Math.random() * 26) - 50;
            power += powerChange;
            if (power < 0) power = 0;
            resultText = "!!!CRITICAL FAILURE!!!";

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = msg.guild.roles.cache.get(criticalFailureRoleId);
            if (member && role && !member.roles.cache.has(role.id)) member.roles.add(role).catch(console.error);

        } else if (roll > 1 - criticalSuccessChance) {
            powerChange = Math.floor(Math.random() * 26) + 50;
            power += powerChange;
            if (power > maxPower) power = maxPower;
            resultText = "!!!CRITICAL SUCCESS!!!";

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = msg.guild.roles.cache.get(criticalSuccessRoleId);
            if (member && role && !member.roles.cache.has(role.id)) member.roles.add(role).catch(console.error);

        } else if (roll < 0.15) {
            powerChange = -(Math.floor(Math.random() * 11) + 5);
            power += powerChange;
            if (power < 0) power = 0;
            resultText = "Idiot detected:\nMinor damage caused.";

        } else {
            powerChange = Math.floor(Math.random() * 16) + 5;
            power += powerChange;
            if (power > maxPower) power = maxPower;
            resultText = "System stabilization successful.";
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
