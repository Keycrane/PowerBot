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
    { question: "What is 9 plus 10?\n(PowerBot detected: Answer contains numbers only)", answer: "19" },
    { question: "Why was 6 afraid of seven?\n(PowerBot detected: Answer contains numbers only)", answer: ["789", "67"] },
    { question: "Who is the bestest backaways member?\n(PowerBot detected: Answer is VERY WRONG. and has one word)", answer: "Tyro" },
    { question: "GLORY GREATEST COUNTRY!!!\n(PowerBot detected: Answer has one word, or can have multiple)", answer: ["Glory to arstotzka", "Arstotzka"] },
    { question: "What is BA-1s original STEAM username?\n(PowerBot detected: Answer has one word, without any numbers)", answer: "Killer" },
    { question: "What is David Lee's/Fire eyes IP address =)\n(PowerBot detected: err)", answer: ["IDK","TELL ME IT DAVID","TELLMEITDAVID","TELL ME IT FIRE","TELLMEITFIRE",""," "] },
    { question: "What IS Fire?\n(PowerBot detected)", answer: ["Tree-Fucking pixie","Tree Fucking pixie","TreeFuckingPixie","TreeFucking pixie"] },
    { question: "*I need cash now call:*\n(PowerBot detected: Answer contains numbers, letters, spaces, AND dashes)", answer: "JG Wentworth 877-CASH-NOW" },
    { question: "What is blue and smells like red paint?\n(PowerBot detected: Answer has two words)", answer: "Blue paint" },
    { question: "Who is the ULTIMATE side character?\n(PowerBot detected: Answer has one word, very mean)", answer: ["Stevan","Yukito","PowerBot"] },
    { question: "Name one of my dogs =)\n(PowerBot detected)", answer: ["Jingle","Oakley","Bear","tiny"] }
];

// ----- Trivia Tracking -----
const triviaMessages = new Set(); // IDs of trivia answers to skip
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

// ----- Power Decay Interval -----
setInterval(async () => {
    try {
        const channel = client.channels.cache.get(powerChannelId);
        if (!channel || !channel.isTextBased()) return;

        if (power > 0) {
            power -= powerDecay;
            if (power < 0) power = 0;
        }

        await updatePowerMessage();

        if (power === 0 && !isLocked) {
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

            if (recoveryTimeout) { clearTimeout(recoveryTimeout); recoveryTimeout = null; }
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

    // Skip normal power processing for trivia answers
    if (triviaActive && msg.author.id !== saboteurUserId) return;
    if (triviaMessages.has(msg.id)) {
        triviaMessages.delete(msg.id);
        return;
    }

    // ----- SABOTAGE TRIVIA -----
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

            const filter = async m => !m.author.bot;

            const collector = channel.createMessageCollector({ filter, max: 1, time: 10000 });

            collector.on('collect', async answerMsg => {
                triviaMessages.add(answerMsg.id); // mark as trivia
                triviaActive = false;
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
                    const flavorText = await channel.send(`***There's a sudden scoff of annoyance- and then-... sparks fly followed by a loud THUD.***\n**Current Power: ${power}%**`);
                    setTimeout(() => flavorText.delete().catch(() => {}), 5000);
                    await updatePowerMessage();
                }
            });
        }

        return; // skip normal processing for sabotage
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

        // Critical failure
        if (roll < criticalFailureChance) {
            powerChange = -Math.floor(Math.random()*26) - 50;
            power += powerChange;
            if (power < 0) power = 0;
            resultText = `!!!CRITICAL FAILURE!!!\nST4Y 4W47 F40M M3!!!!!`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalFailureRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);
        }
        // Critical success
        else if (roll > 1 - criticalSuccessChance) {
            powerChange = Math.floor(Math.random()*26) + 50;
            power += powerChange;
            if (power > maxPower) power = maxPower;
            resultText = `!!!CRITICAL SUCCESS!!!\nYay. You are my favorite meatbag.\nI'll tell the other bots about you :D`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalSuccessRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);
        }
        // Normal failure
        else if (roll < 0.15) {
            powerChange = -(Math.floor(Math.random()*11)+5);
            power += powerChange;
            if (power < 0) power = 0;

            if (powerChange >= -7) resultText = `Idiot detected >:(\nMinor damage caused.`;
            else if (powerChange >= -11) resultText = `3RR0R.\nSY5T3M D454G3 D3TEC13D.\n3DUC4T3 TH15 1NDIV1DUAL PL7 :C`;
            else resultText = `[01011001 01001111 01010101 ...]`;
        }
        // Normal success
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
client.once('ready', ()=> {
    console.log(`Logged in as ${client.user.tag}`);
    updatePowerMessage();
});
client.login(TOKEN);
