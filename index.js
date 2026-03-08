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
const powerDecay = 1;
const intervalMs = 400000;
const recoveryAmount = 77;
const recoveryDelay = 28800000;

const lowPowerRoleId = '1479873423692927157';
const missingRoleId = '1479623741506846741';
let missingUserId = null;

const criticalSuccessRoleId = '1479623726319276174';
const criticalFailureRoleId = '1479623616319590451';

const powerChannelId = '1479622905439719424';

const slowChannels = [
    '1444811009507459073',
    '1444809596484059156',
    '1444804838729842838',
    '1444805065998205058',
    '1444805046251552880',
    '1444805255572230185',
    '1444805192364327002'
];

let powerMessage;
let lastLogMessage = null;
let lastOperatorId = null;

let processingMessage = false;
let isLocked = false;
let recoveryTimeout = null;

// ----- Sabotage / Trivia Configuration -----
const saboteurUserId = '1042092688801013901';
const backawaysRoleId = '1446339217763340298';

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
let triviaActive = false;
let triviaAnswerLock = false; // prevents trivia answers powering the bot

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
            
            // Give everyone Low Power role
            const role = await channel.guild.roles.fetch(lowPowerRoleId).catch(()=>null);
            
            if (role) {
            
                const members = await channel.guild.members.fetch();
            
                members.forEach(member => {
                    if (!member.user.bot && !member.roles.cache.has(role.id)) {
                        member.roles.add(role).catch(()=>{});
                    }
                });
            }
            
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
                    
                    // Remove Low Power role from everyone
                    const role = await channel.guild.roles.fetch(lowPowerRoleId).catch(()=>null);
                    
                    if (role) {
                    
                        const members = await channel.guild.members.fetch();
                    
                        members.forEach(member => {
                            if (member.roles.cache.has(role.id)) {
                                member.roles.remove(role).catch(()=>{});
                            }
                        });
                    
                    }
                    
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

            // Remove Low Power role from everyone
            const role = await channel.guild.roles.fetch(lowPowerRoleId).catch(()=>null);
            
            if (role) {
            
                const members = await channel.guild.members.fetch();
            
                members.forEach(member => {
                    if (member.roles.cache.has(role.id)) {
                        member.roles.remove(role).catch(()=>{});
                    }
                });
            }
            // mAKE SLOW CHANNELS NOT SLOW
            slowChannels.forEach(id => {
                const ch = client.channels.cache.get(id);
                if (ch && ch.isTextBased()) ch.setRateLimitPerUser(0).catch(console.error);
            });
            
            // Get rid of missing role
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

    // Skip normal power processing during trivia
    if (triviaActive || triviaAnswerLock) return;

    // ----- SABOTAGE / TRIVIA -----
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
        const triviaMsg = await channel.send(`${role} *WARNING 5YS3TM C0mP4AMIS3D*\n P3#S3 He4# ##\n =) Awnser *now*: ${triviaQuestion}`);

            const filter = m => !m.author.bot;
            const collector = channel.createMessageCollector({ filter, max: 1, time: 10000 });

            collector.on('collect', async answerMsg => {
                triviaAnswerLock = true;
                await answerMsg.delete().catch(()=>{});
                triviaActive = false;
                await triviaMsg.delete().catch(() => {});

                const input = answerMsg.content.trim().toLowerCase();
                const isCorrect = Array.isArray(correctAnswer)
                    ? correctAnswer.map(a => a.toLowerCase()).includes(input)
                    : input === correctAnswer.toLowerCase();

                let flavorText;

                if (isCorrect) {
                    flavorText = await channel.send(`***A frustrated groan is heard somewhere close by, and then, something scurrys away...***\n**Nothing happened...**`);
                } else {
                    power -= 25;
                    if (power < 0) power = 0;
                    flavorText = await channel.send(`***A brief chuckle is heard before sparks fly...***\n**The generator loses 25% power. Current Power: ${power}%**`);
                    await updatePowerMessage();
                }

                setTimeout(() => {
                    flavorText.delete().catch(() => {});
                    triviaAnswerLock = false;
                }, 1200000);
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

        if (roll < criticalFailureChance) { // Critical failure
            powerChange = -Math.floor(Math.random()*26) - 50;
            power += powerChange;
            if (power < 0) power = 0;
            resultText = `!!!CRITICAL FAILURE!!!\nST4Y 4W47 F40M M3!!!!!`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalFailureRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);

        } else if (roll > 1 - criticalSuccessChance) { // Critical success
            powerChange = Math.floor(Math.random()*26) + 50;
            power += powerChange;
            if (power > maxPower) power = maxPower;
            resultText = `!!!CRITICAL SUCCESS!!!\nYay. You are my favorite meatbag.\nI'll tell the other bots about you :D`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalSuccessRoleId).catch(()=>null);
            if (member && role && !member.roles.cache.has(role.id)) await member.roles.add(role).catch(console.error);

        } else if (roll < 0.15) { // Normal failure
            powerChange = -(Math.floor(Math.random()*11)+5);
            power += powerChange;
            if (power < 0) power = 0;

            if (powerChange >= -7) resultText = `Idiot detected >:(\nMinor damage caused.`;
            else if (powerChange >= -11) resultText = `3RR0R.\nSY5T3M D454G3 D3TEC13D.\n3DUC4T3 TH15 1NDIV1DUAL PL7 :C`;
            else resultText = `[01011001 01001111 01010101 ...]`;

        } else { // Normal success
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
