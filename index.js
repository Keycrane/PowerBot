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

// ----- Sabotage / Trivia -----
const saboteurUserId = '1005390783924404274';
const backawaysRoleId = '1479263355385413672';

let triviaActive = false;

// ----- Trivia Questions -----
const triviaPool = [
{ question:"What is 9 plus 10?\n(PowerBot detected: Answer contains numbers only)", answer:"19"},
{ question:"Why was 6 afraid of seven?\n(PowerBot detected: Answer contains numbers only)", answer:["789","67"]},
{ question:"Who is the bestest backaways member?\n(PowerBot detected: Answer is VERY WRONG. and has one word)", answer:"Tyro"},
{ question:"GLORY GREATEST COUNTRY!!!\n(PowerBot detected: Answer has one word, or can have multiple)", answer:["glory to arstotzka","arstotzka"]},
{ question:"What is BA-1s original STEAM username?\n(PowerBot detected: Answer has one word, without any numbers)", answer:"killer"},
{ question:"What is blue and smells like red paint?\n(PowerBot detected: Answer has two words)", answer:"blue paint"}
];

// ----- Update Power Bar -----
async function updatePowerMessage() {

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel) return;

    const barLength = 20;
    const filled = Math.max(0, Math.floor((power / maxPower) * barLength));
    const empty = barLength - filled;

    const bar = "█".repeat(filled) + "░".repeat(empty);

    if (!powerMessage) {
        powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
    } else {
        await powerMessage.edit(`Power: ${bar} (${power}%)`);
    }
}

// ----- Power Decay -----
setInterval(async () => {

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel) return;

    if (power > 0) {
        power -= powerDecay;
        if (power < 0) power = 0;
    }

    await updatePowerMessage();

}, intervalMs);


// ----- Message Handler -----
client.on('messageCreate', async msg => {

    if (msg.author.bot) return;
    if (msg.channel.id !== powerChannelId) return;

    const channel = msg.channel;

    // ----- SABOTAGE -----
    if (msg.author.id === saboteurUserId && /^\d+$/.test(msg.content)) {

        const number = parseInt(msg.content);

        await msg.delete().catch(()=>{});

        if (number === 1 && !triviaActive) {

            triviaActive = true;

            const role = await msg.guild.roles.fetch(backawaysRoleId);

            const randomTrivia = triviaPool[Math.floor(Math.random()*triviaPool.length)];

            const triviaMsg = await channel.send(
`${role}
⚠ GENERATOR CHALLENGE INITIATED

${randomTrivia.question}`
            );

            const collector = channel.createMessageCollector({
                time:10000
            });

            collector.on('collect', async m => {

                if (m.author.bot) return;

                if (m.author.id === saboteurUserId && /^\d+$/.test(m.content)) return;

                await m.delete().catch(()=>{});

                triviaActive = false;

                collector.stop();

                await triviaMsg.delete().catch(()=>{});

                const input = m.content.trim().toLowerCase();

                let correct = false;

                if (Array.isArray(randomTrivia.answer)) {

                    correct = randomTrivia.answer
                        .map(a=>a.toLowerCase())
                        .includes(input);

                } else {

                    correct = input === randomTrivia.answer.toLowerCase();
                }

                let flavor;

                if (correct) {

                    flavor = await channel.send(
"***A frustrated groan echoes through the generator room...***\n**Nothing happened.**"
                    );

                } else {

                    power -= 25;
                    if (power < 0) power = 0;

                    flavor = await channel.send(
`***A quiet chuckle... sparks erupt from the generator.***\n**Generator loses 25% power. Current: ${power}%**`
                    );

                    await updatePowerMessage();
                }

                setTimeout(()=>{
                    flavor.delete().catch(()=>{});
                },5000);

            });

            collector.on('end', async collected => {

                if (triviaActive) {

                    triviaActive = false;

                    await triviaMsg.delete().catch(()=>{});

                    power -= 35;
                    if (power < 0) power = 0;

                    const flavor = await channel.send(
`***A loud metallic THUD shakes the generator...***\n**Generator loses power. Current: ${power}%**`
                    );

                    setTimeout(()=>{
                        flavor.delete().catch(()=>{});
                    },5000);

                    await updatePowerMessage();
                }

            });

        }

        return;
    }

    // ----- BLOCK POWERING DURING TRIVIA -----
    if (triviaActive) return;

    // ----- NORMAL GENERATOR INPUT -----
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

            powerChange = -50 - Math.floor(Math.random()*26);
            power += powerChange;
            if (power < 0) power = 0;

            resultText = "!!!CRITICAL FAILURE!!!\nST4Y 4W47 F40M M3!!!!!";

        }

        else if (roll > 1 - criticalSuccessChance) {

            powerChange = 50 + Math.floor(Math.random()*26);
            power += powerChange;
            if (power > maxPower) power = maxPower;

            resultText = "!!!CRITICAL SUCCESS!!!\nYou are my favorite meatbag.";

        }

        else if (roll < 0.15) {

            powerChange = -(Math.floor(Math.random()*11)+5);
            power += powerChange;
            if (power < 0) power = 0;

            resultText = "ERROR.\nSystem damage detected.";

        }

        else {

            powerChange = Math.floor(Math.random()*16)+5;
            power += powerChange;
            if (power > maxPower) power = maxPower;

            resultText = "System stabilization successful.";

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

    } catch(err) {

        console.error(err);

    } finally {

        processingMessage = false;

    }

});


// ----- Web Keep Alive -----
const app = express();

app.get('/',(req,res)=>res.send("Bot alive"));

app.listen(process.env.PORT || 3000);


// ----- Bot Ready -----
client.once('ready', ()=>{

console.log(`Logged in as ${client.user.tag}`);

updatePowerMessage();

});

client.login(TOKEN);
