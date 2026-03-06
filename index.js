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

// ----- Sabotage Configuration -----
const saboteurUserId = '1005390783924404274'; // Replace with the ID of the user who triggers sabotage
const backawaysRoleId = '1479263355385413672'; // Replace with the role ID to ping for trivia

// ----- Trivia Questions -----
const triviaPool = [
    {
        question: "What is 9 plus 10?\n (PowerBot detected: Awnser contains numbers only)",
        answer: "19"
    },
    {
        question: "Whys was 6 afraid of seven?\n (PowerBot detected: Awnser contains numbers only)",
        answer: ["789", "67"]
    },
    {
        question: "Who is the bestest backaways member?\n (PowerBot detected: Awnser is VERY WRONG. and has one word)",
        answer: "Tyro"
    },
    {
        question: "GLORY GREATEST COUNTRY!!!\n (PowerBot detected: Awnser has one word, or can have multiple)",
        answer: ["Glory to arstotzka", "Arstotzka"]
    },
    {
        question: "What is BA-1s original STEAM username?\n (PowerBot detected: Awnser has one word, without any numbers",
        answer: "Killer"
    },
    {
        question: "What is David Lee's/Fire eyes IP address =) \n (P0w3rB0t d3te##3d: err",
        answer: ["IDK", "TELL ME IT DAVID", "TELLMEITDAVID", "TELL ME IT FIRE", "TELLMEITFIRE", "", " "]
    },
    {
        question: "What IS Fire?\n (P0w3R B##-...\n You know what you are =)",
        answer: ["Tree-Fucking pixie", "Tree Fucking pixie", "TreeFuckingPixie", "TreeFucking pixie"]
    },
    {
        question: "*I need cash nooow call:*\n (PowerBot detected: Awnser contains numbers, letters, spaces, AND dashes... Oh no...)",
        answer: "JG Wentworth 877-CASH-NOW"
    },
    {
        question: "What is blue and smells like red paint?\n (PowerBot detected: Awnser has Two Words)",
        answer: "Blue paint"
    },
    {
        question: "Who is the ULTIMATE side character?\n (PowerBot detected: Awnser has one word, and is very mean :C)",
        answer: ["Stevan", "Yukito", "PowerBot"]
    },
    {
        question: "Name one of my dogs =) \n (P0we4B0t d3#####: ErrR",
        answer: ["Jingle", "Oakley", "Bear", "tiny"]
    }
];

// ----- Trivia Answer Tracking -----
const triviaMessages = new Set(); // store message IDs that are trivia answers
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
                await channel.permissionOverwrites.edit(
                    channel.guild.roles.everyone,
                    { SendMessages: false }
                );
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

                    await channel.permissionOverwrites.edit(
                        channel.guild.roles.everyone,
                        { SendMessages: true }
                    );

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
            await channel.permissionOverwrites.edit(
                channel.guild.roles.everyone,
                { SendMessages: true }
            );
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

    // Block normal processing while trivia is active
    if (triviaActive && msg.author.id !== saboteurUserId) {
        return;
    }

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel || msg.channel.id !== powerChannelId) return;

    // ----- Skip trivia answers -----
    if (triviaMessages.has(msg.id)) {
        triviaMessages.delete(msg.id);
        return;
    }

    // ----- SABOTAGE CHECK -----
    if (msg.author.id === saboteurUserId && /^\d+$/.test(msg.content.trim())) {
        const number = parseInt(msg.content.trim());

        await msg.delete().catch(()=>{}); // delete the saboteur's "1"

        if (number === 1) {
            if (triviaActive) return;
            const role = await msg.guild.roles.fetch(backawaysRoleId).catch(()=>null);
            if (!role) return;

            const randomTrivia = triviaPool[Math.floor(Math.random() * triviaPool.length)];

            const triviaQuestion = randomTrivia.question;
            const correctAnswer = randomTrivia.answer;

            triviaActive = true;
            const triviaMsg = await channel.send(`${role} Answer quickly: ${triviaQuestion}`);

            const filter = async m => {
                if (m.author.bot) return false;
                const member = await msg.guild.members.fetch(m.author.id).catch(()=>null);
                return member ? member.roles.cache.has(backawaysRoleId) : false;
            };

            const collector = channel.createMessageCollector({ filter, max: 1, time: 10000 });

            collector.on('collect', async answerMsg => {
                triviaActive = false;
                triviaMessages.add(answerMsg.id);
                await triviaMsg.delete().catch(() => {});

                let flavorText;
                const member = await msg.guild.members.fetch(answerMsg.author.id).catch(()=>null);

                const input = answerMsg.content.trim().toLowerCase();

                const isCorrect = Array.isArray(correctAnswer)
                    ? correctAnswer.map(a => a.toLowerCase()).includes(input)
                    : input === correctAnswer.toLowerCase();
                
                if (isCorrect) {
                    flavorText = await channel.send(`***A frusterated groan is heard somewhere close by, before-...***\n**Nothing happened...**`);
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
                    const flavorText = await channel.send(`***There's a sudden scoff of annoyance- and then-... sparks fly. followed by a loud THUD.***\n**Current Power: ${power}%**`);
                    setTimeout(() => flavorText.delete().catch(() => {}), 5000);
                    await updatePowerMessage();
                }
            });
        }

        return; // Skip normal processing for sabotage
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

        // ----- CRITICAL FAILURE -----
        if (roll < criticalFailureChance) {
            powerChange = -Math.floor(Math.random()*26) - 50;
            power += powerChange;
            if (power < 0) power = 0;

            resultText = `!!!CRITICAL FAILURE!!!\nST4Y 4W47 F40M M3!!!!!`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalFailureRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);
        }

        // ----- CRITICAL SUCCESS -----
        else if (roll > 1 - criticalSuccessChance) {
            powerChange = Math.floor(Math.random()*26) + 50;
            power += powerChange;
            if (power > maxPower) power = maxPower;

            resultText = `!!!CRITICAL SUCCESS!!!\nYay. You are my favorite meatbag.\nI'll tell the other bots about you :D`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalSuccessRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);
        }

        // ----- NORMAL FAILURE -----
        else if (roll < 0.15) {
            powerChange = -(Math.floor(Math.random()*11)+5);
            power += powerChange;
            if (power < 0) power = 0;

            if (powerChange >= -7) resultText = `Idiot detected >:(\nMinor damage caused.`;
            else if (powerChange >= -11) resultText = `3RR0R.\nSY5T3M D454G3 D3TEC13D.\n3DUC4T3 TH15 1NDIV1DUAL PL7 :C`;
            else resultText = `[01011001 01001111 01010101 00100000 01000001 01010010 01000101 00100000 01010100 01001000 01000101 00100000 01001101 01000101 01000001 01001110 01000101 01010011 01010100 00100000 01000010 01000001 01000011 01001011 01000001 01010111 01000001 01011001 00100000 01001101 01000101 01001101 01000010 01000101 01010010 00100000 00111010 01000011]`;
        }

        // ----- NORMAL SUCCESS -----
        else {
            powerChange = Math.floor(Math.random()*16)+5;
            power += powerChange;
            if (power > maxPower) power = maxPower;

            if (powerChange <= 8) resultText = `System stabilization successful.\nUsage of duct tape was detected during repairs.\nYour success has surprised me.`;
            else if (powerChange <= 14) resultText = `System stabilization successful.\nMechanical services acceptable.\nThank you :)`;
            else resultText = `Major repair completed.\nPower grid efficiency restored.\nYou make me happy :D`;
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
client.once('ready', ()=>{
    console.log(`Logged in as ${client.user.tag}`);
    updatePowerMessage();
});
client.login(TOKEN);
