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
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
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

// ----- Sabotage / Trivia Configuration -----
const saboteurUserId = '1005390783924404274';
const backawaysRoleId = '1479263355385413672';

// ----- Trivia Questions -----
const triviaPool = [
    {
        question: "What is 9 plus 10?\n (PowerBot detected: Answer contains numbers only)",
        answer: "19"
    },
    {
        question: "Why was 6 afraid of seven?\n (PowerBot detected: Answer contains numbers only)",
        answer: ["789", "67"]
    },
    {
        question: "Who is the bestest backaways member?\n (PowerBot detected: Answer is VERY WRONG. and has one word)",
        answer: "Tyro"
    },
    {
        question: "GLORY GREATEST COUNTRY!!!\n (PowerBot detected: Answer has one word, or can have multiple)",
        answer: ["Glory to arstotzka", "Arstotzka"]
    },
    {
        question: "What is BA-1s original STEAM username?\n (PowerBot detected: Answer has one word, without any numbers)",
        answer: "Killer"
    },
    {
        question: "What is David Lee's/Fire eyes IP address =) \n (P0w3rB0t detected: err",
        answer: ["IDK", "TELL ME IT DAVID", "TELLMEITDAVID", "TELL ME IT FIRE", "TELLMEITFIRE", "", " "]
    },
    {
        question: "What IS Fire?\n (P0w3R B##-...\n You know what you are =)",
        answer: ["Tree-Fucking pixie", "Tree Fucking pixie", "TreeFuckingPixie", "TreeFucking pixie"]
    },
    {
        question: "*I need cash nooow call:*\n (PowerBot detected: Answer contains numbers, letters, spaces, AND dashes... Oh no...)",
        answer: "JG Wentworth 877-CASH-NOW"
    },
    {
        question: "What is blue and smells like red paint?\n (PowerBot detected: Answer has Two Words)",
        answer: "Blue paint"
    },
    {
        question: "Who is the ULTIMATE side character?\n (PowerBot detected: Answer has one word, and is very mean :C)",
        answer: ["Stevan", "Yukito", "PowerBot"]
    },
    {
        question: "Name one of my dogs =) \n (P0we4B0t detected: ErrR)",
        answer: ["Jingle", "Oakley", "Bear", "tiny"]
    }
];

// ----- Trivia Answer Tracking -----
const triviaMessages = new Set();
let triviaActive = false;

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

        if (power > 0) {
            power -= powerDecay;
            if (power < 0) power = 0;
        }

        await updatePowerMessage();

        if (power === 0) {
            if (!isLocked) {
                await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
                console.log(`Locked ${channel.name}`);
                isLocked = true;

                slowChannels.forEach(id => {
                    const ch = client.channels.cache.get(id);
                    if (ch && ch.isTextBased()) ch.setRateLimitPerUser(10).catch(console.error);
                });

                if (lastOperatorId) {
                    const member = await channel.guild.members.fetch(lastOperatorId).catch(()=>null);
                    const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);
                    if (member && role && !member.roles.cache.has(role.id)) {
                        await member.roles.add(role).catch(console.error);
                        missingUserId = member.id;
                    }
                }
            }

            if (!recoveryTimeout) {
                recoveryTimeout = setTimeout(async () => {
                    power += recoveryAmount;
                    if (power > maxPower) power = maxPower;

                    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: true });
                    console.log(`Unlocked ${channel.name}`);
                    isLocked = false;

                    slowChannels.forEach(id => {
                        const ch = client.channels.cache.get(id);
                        if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
                    });

                    if (missingUserId) {
                        const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                        const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);
                        if (member && role) await member.roles.remove(role).catch(console.error);
                        missingUserId = null;
                    }

                    await updatePowerMessage();
                    recoveryTimeout = null;
                }, recoveryDelay);
            }
        }
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

            if (missingUserId) {
                const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);
                if (member && role) await member.roles.remove(role).catch(console.error);
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

    // ----- Skip trivia messages from powering the bot -----
    if (triviaMessages.has(msg.id)) {
        triviaMessages.delete(msg.id);
        return;
    }

    // ----- SABOTAGE / Trivia Check -----
    if (msg.author.id === saboteurUserId && /^\d+$/.test(msg.content.trim())) {
        const number = parseInt(msg.content.trim());
        await msg.delete().catch(()=>{});

        if (number === 1 && !triviaActive) {
            const role = await msg.guild.roles.fetch(backawaysRoleId).catch(()=>null);
            if (!role) return;

            const randomTrivia = triviaPool[Math.floor(Math.random() * triviaPool.length)];
            const triviaQuestion = randomTrivia.question;
            const correctAnswer = randomTrivia.answer;

            triviaActive = true;
            const triviaMsg = await channel.send(`${role} Answer quickly: ${triviaQuestion}`);

            const filter = async m => {
                if (m.author.bot) return false;
                return true; // Anyone can answer
            };

            const collector = channel.createMessageCollector({ filter, max: 1, time: 10000 });

            collector.on('collect', async answerMsg => {
                triviaActive = false;
                triviaMessages.add(answerMsg.id);
                await triviaMsg.delete().catch(() => {});

                const input = answerMsg.content.trim().toLowerCase();
                const isCorrect = Array.isArray(correctAnswer)
                    ? correctAnswer.map(a => a.toLowerCase()).includes(input)
                    : input === correctAnswer.toLowerCase();

                let flavorText;
                if (isCorrect) {
                    flavorText = await channel.send(`***A frustrated groan is heard somewhere close by...***\n**Nothing happened...**`);
                } else {
                    power -= 25;
                    if (power < 0) power = 0;
                    flavorText = await channel.send(`***A brief chuckle is heard before sparks fly...***\n**The generator loses 25% power. Current Power: ${power}%**`);
                    await updatePowerMessage();
                }

                setTimeout(() => flavorText.delete().catch(() => {}), 5000);
            });

            collector.on('end', async collected => {
                triviaActive = false;
                triviaMsg.delete().catch(() => {});

                if (collected.size === 0) {
                    power -= 35;
                    if (power < 0) power = 0;
                    const flavorText = await channel.send(`***There's a sudden scoff of annoyance- and then-... sparks fly, followed by a loud THUD.***\n**Current Power: ${power}%**`);
                    setTimeout(() => flavorText.delete().catch(() => {}), 5000);
                    await updatePowerMessage();
                }
            });
        }

        return; // Only skip normal processing for saboteur messages
    }

    // ----- NORMAL MESSAGE PROCESSING -----
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

        if (roll < criticalFailureChance) {
            powerChange = -Math.floor(Math.random()*26) - 50;
            power += powerChange;
            if (power < 0) power = 0;
            resultText = `!!!CRITICAL FAILURE!!!\nST4Y 4W47 F40M M3!!!!!`;
            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalFailureRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);
        } else if (roll > 1 - criticalSuccessChance) {
            powerChange = Math.floor(Math.random()*26) + 50;
            power += powerChange;
            if (power > maxPower) power = maxPower;
            resultText = `!!!CRITICAL SUCCESS!!!\nYay. You are my favorite meatbag.\nI'll tell the other bots about you :D`;
            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalSuccessRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);
        } else if (roll < 0.15) {
            powerChange = -(Math.floor(Math.random()*11)+5);
            power += powerChange;
            if (power < 0) power = 0;
            resultText = powerChange >= -7
                ? `Idiot detected >:(\nMinor damage caused.`
                : powerChange >= -11
                ? `3RR0R.\nSY5T3M D454G3 D3TEC13D.\n3DUC4T3 TH15 1NDIV1DUAL PL7 :C`
                : `[01011001 01001111 01010101 ...]`;
        } else {
            powerChange = Math.floor(Math.random()*16)+5;
            power += powerChange;
            if (power > maxPower) power = maxPower;
            resultText = powerChange <= 8
                ? `System stabilization successful.\nUsage of duct tape was detected during repairs.\nYour success has surprised me.`
                : powerChange <= 14
                ? `System stabilization successful.\nMechanical services acceptable.\nThank you :)`
                : `Major repair completed.\nPower grid efficiency restored.\nYou make me happy :D`;
        }

        if (lastLogMessage) await lastLogMessage.delete().catch(()=>{});

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
client.once('ready', ()=> {
    console.log(`Logged in as ${client.user.tag}`);
    updatePowerMessage();
});
client.login(TOKEN);
