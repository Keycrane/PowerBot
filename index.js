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
const powerDecay = 10;
const intervalMs = 20000;
const recoveryAmount = 65;
const recoveryDelay = 10000;

const missingRoleId = '1479263627122053203';
let missingUserId = null;

const criticalSuccessRoleId = '1479263606368501804';
const criticalFailureRoleId = '1479263624328384662';

const powerChannelId = '1074684871852691488';

const slowChannels = [
    '1074685958580080640',
    '1074687038391074877',
    '1074705588761677845'
];

let powerMessage;
let lastLogMessage = null;
let lastOperatorId = null;

let processingMessage = false;

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

// ----- Power Interval -----
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

        // ----- POWER HIT 0 -----
        if (power === 0) {

            if (!isLocked) {

                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone,
                    { SendMessages: false }
                );

                console.log(`Locked ${channel.name}`);
                isLocked = true;

                // Apply slowmode
                slowChannels.forEach(id => {

                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased()) {
                        ch.setRateLimitPerUser(10).catch(console.error);
                    }

                });

                // Give Missing role
                if (lastOperatorId) {

                    const member = await channel.guild.members.fetch(lastOperatorId).catch(()=>null);
                    const role = channel.guild.roles.cache.get(missingRoleId);

                    if (member && role && !member.roles.cache.has(role.id)) {

                        await member.roles.add(role).catch(console.error);
                        missingUserId = member.id;

                    }

                }

            }

            // Start recovery timer
            if (!recoveryTimeout) {

                recoveryTimeout = setTimeout(async () => {

                    power += recoveryAmount;
                    if (power > maxPower) power = maxPower;

                    await channel.permissionOverwrites.edit(
                        channel.guild.roles.everyone,
                        { SendMessages: true }
                    );

                    console.log(`Unlocked ${channel.name}`);
                    isLocked = false;

                    // Remove slowmode
                    slowChannels.forEach(id => {

                        const ch = client.channels.cache.get(id);
                        if (ch && ch.isTextBased()) {
                            ch.setRateLimitPerUser(0).catch(console.error);
                        }

                    });

                    // Remove Missing role
                    if (missingUserId) {

                        const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                        const role = channel.guild.roles.cache.get(missingRoleId);

                        if (member && role) {
                            await member.roles.remove(role).catch(console.error);
                        }

                        missingUserId = null;

                    }

                    await updatePowerMessage();

                    recoveryTimeout = null;

                }, recoveryDelay);

            }

        }

        // ----- UNLOCK IF POWER RETURNS -----
        else if (power > 0 && isLocked) {

            await channel.permissionOverwrites.edit(
                channel.guild.roles.everyone,
                { SendMessages: true }
            );

            console.log(`Unlocked ${channel.name}`);

            isLocked = false;

            slowChannels.forEach(id => {

                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased()) {
                    ch.setRateLimitPerUser(0).catch(console.error);
                }

            });

            if (recoveryTimeout) {
                clearTimeout(recoveryTimeout);
                recoveryTimeout = null;
            }

            // Remove Missing role
            if (missingUserId) {

                const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                const role = channel.guild.roles.cache.get(missingRoleId);

                if (member && role) {
                    await member.roles.remove(role).catch(console.error);
                }

                missingUserId = null;

            }

        }

    } catch (err) {

        console.error("Power interval error:", err);

    }

}, intervalMs);

// ----- Message Handler -----
client.on('messageCreate', async msg => {

    if (msg.author.bot) return;

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || msg.channel.id !== powerChannelId) return;

    if (processingMessage) return;
    processingMessage = true;

    try {

        lastOperatorId = msg.author.id;

        const originalMessage = msg.content;

        await msg.delete().catch(()=>{});

        let powerChange;
        let resultText;

        const roll = Math.random();

        const criticalFailureChance = 0.01;
        const criticalSuccessChance = 0.01;

        // ----- CRITICAL FAILURE -----
        if (roll < criticalFailureChance) {

            powerChange = -Math.floor(Math.random()*26) - 50;

            power += powerChange;

            if (power < 0) power = 0;

            resultText =
`!!!CRITICAL FAILURE!!!
ST4Y 4W47 F40M M3!!!!!`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = msg.guild.roles.cache.get(criticalFailureRoleId);

            if (member && role && !member.roles.cache.has(role.id)) {
                member.roles.add(role).catch(console.error);
            }

        }

        // ----- CRITICAL SUCCESS -----
        else if (roll > 1 - criticalSuccessChance) {

            powerChange = Math.floor(Math.random()*26) + 50;

            power += powerChange;

            if (power > maxPower) power = maxPower;

            resultText =
`!!!CRITICAL SUCCESS!!!
Yay. You are my favorite meatbag.
I'll tell the other bots about you :D`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = msg.guild.roles.cache.get(criticalSuccessRoleId);

            if (member && role && !member.roles.cache.has(role.id)) {
                member.roles.add(role).catch(console.error);
            }

        }

        // ----- NORMAL FAILURE -----
        else if (roll < 0.15) {

            powerChange = -(Math.floor(Math.random()*11)+5);

            power += powerChange;
            if (power < 0) power = 0;

            if (powerChange >= -7)
                resultText =
`Idiot detected >:(
Minor damage caused.`;

            else if (powerChange >= -11)
                resultText =
`3RR0R.
SY5T3M D454G3 D3TEC13D.
3DUC4T3 TH15 1NDIV1DUAL PL7 :C`;

            else
                resultText =
`[01011001 01001111 01010101 00100000 01000001 01010010 01000101 00100000 01010100 01001000 01000101 00100000 01001101 01000101 01000001 01001110 01000101 01010011 01010100 00100000 01000010 01000001 01000011 01001011 01000001 01010111 01000001 01011001 00100000 01001101 01000101 01001101 01000010 01000101 01010010 00100000 00111010 01000011]`;
        }

        // ----- NORMAL SUCCESS -----
        else {

            powerChange = Math.floor(Math.random()*16)+5;

            power += powerChange;

            if (power > maxPower) power = maxPower;

            if (powerChange <= 8)
                resultText =
`System stabilization successful.
Usage of duct tape was detected during repairs.
Your success has surprised me.`;

            else if (powerChange <= 14)
                resultText =
`System stabilization successful.
Mechanical services acceptable.
Thank you :)`;

            else
                resultText =
`Major repair completed.
Power grid efficiency restored.
You make me happy :D`;
        }

        if (lastLogMessage) {
            await lastLogMessage.delete().catch(()=>{});
        }

        lastLogMessage = await channel.send(
`POWER GRID TERMINAL
-------------------------

Operator: ${msg.author.username}

Notes:
> ${originalMessage}

Result:
${resultText}

Power Change: ${powerChange>0?'+':''}${powerChange}%
Current Power: ${power}%`
        );

        await updatePowerMessage();

    } catch (err) {

    console.error("Log system error:", err);

} finally {

    processingMessage = false;

}

});

// ----- Keep Alive Server -----
const app = express();

app.get('/', (req,res)=>res.send("Bot is alive!"));

const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>console.log(`Web server running on port ${PORT}`));

// ----- Error Handling -----
process.on('unhandledRejection', err => console.error(err));
process.on('uncaughtException', err => console.error(err));

// ----- Bot Login -----
client.once('ready', ()=>{

    console.log(`Logged in as ${client.user.tag}`);

    updatePowerMessage();

});

client.login(TOKEN);
