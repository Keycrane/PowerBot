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
const saboteurUserId = '1005390783924404274';
const backawaysRoleId = '1479263355385413672';

// ----- Trivia Questions -----
const triviaPool = [
    {
        question: "What is 9 plus 10?",
        answer: "19"
    },
    {
        question: "Whys was 6 afraid of seven?",
        answer: ["789","67"]
    },
    {
        question: "Who is the bestest backaways member?",
        answer: "Tyro"
    },
    {
        question: "GLORY GREATEST COUNTRY!!!",
        answer: ["Glory to arstotzka","Arstotzka"]
    },
    {
        question: "What is BA-1s original STEAM username?",
        answer: "Killer"
    },
    {
        question: "What is blue and smells like red paint?",
        answer: "Blue paint"
    }
];

let triviaActive = false;
let activeTriviaAnswers = [];
let triviaQuestionMessage = null;

// ----- Update Power Bar -----
async function updatePowerMessage() {

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel) return;

    const barLength = 20;
    const filled = Math.floor((power/maxPower)*barLength);
    const empty = barLength - filled;

    const bar = '█'.repeat(filled) + '░'.repeat(empty);

    if(!powerMessage){
        powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
    }else{
        await powerMessage.edit(`Power: ${bar} (${power}%)`);
    }
}

// ----- Power Interval -----
setInterval(async ()=>{

    const channel = client.channels.cache.get(powerChannelId);
    if(!channel) return;

    if(power > 0){
        power -= powerDecay;
        if(power < 0) power = 0;
    }

    await updatePowerMessage();

}, intervalMs);

// ----- Message Handler -----
client.on('messageCreate', async msg => {

    if(msg.author.bot) return;

    const channel = client.channels.cache.get(powerChannelId);
    if(!channel) return;

    // ------------------------
    // TRIVIA ANSWER CHECK
    // ------------------------

    if(triviaActive){

        const input = msg.content.trim().toLowerCase();

        if(activeTriviaAnswers.includes(input)){

            triviaActive = false;

            await triviaQuestionMessage.delete().catch(()=>{});

            await msg.channel.send(
`***A frusterated groan echoes through the facility...***

**Nothing happened.**`
            );

        }else{

            triviaActive = false;

            power -= 25;
            if(power < 0) power = 0;

            await triviaQuestionMessage.delete().catch(()=>{});

            await msg.channel.send(
`***A short laugh is heard before sparks erupt from the generator...***

**Power lost: 25%**

Current Power: ${power}%`
            );

            await updatePowerMessage();

        }

        return;
    }

    // ------------------------
    // SABOTAGE
    // ------------------------

    if(msg.author.id === saboteurUserId){

        if(msg.content.trim() === "1"){

            if(triviaActive) return;

            triviaActive = true;

            const role = await msg.guild.roles.fetch(backawaysRoleId);

            const randomTrivia = triviaPool[Math.floor(Math.random()*triviaPool.length)];

            const correctAnswer = randomTrivia.answer;

            activeTriviaAnswers = Array.isArray(correctAnswer)
                ? correctAnswer.map(a=>a.toLowerCase())
                : [correctAnswer.toLowerCase()];

            triviaQuestionMessage = await channel.send(
`${role}

⚠ POWER GRID BREACH DETECTED ⚠

${randomTrivia.question}

**Answer quickly.**`
            );

            setTimeout(async ()=>{

                if(!triviaActive) return;

                triviaActive = false;

                await triviaQuestionMessage.delete().catch(()=>{});

                power -= 35;
                if(power < 0) power = 0;

                await channel.send(
`***A loud metallic crash echoes through the generator room...***

Nobody answered in time.

**Power lost: 35%**

Current Power: ${power}%`
                );

                await updatePowerMessage();

            },10000);

        }

        return;
    }

    // ------------------------
    // NORMAL POWER TERMINAL
    // ------------------------

    if(msg.channel.id !== powerChannelId) return;
    if(processingMessage) return;

    processingMessage = true;

    try{

        lastOperatorId = msg.author.id;

        const originalMessage = msg.content;

        await msg.delete().catch(()=>{});

        const roll = Math.random();

        let powerChange;
        let resultText;

        if(roll < 0.15){

            powerChange = -(Math.floor(Math.random()*11)+5);
            power += powerChange;

            resultText = "System malfunction detected.";

        }else{

            powerChange = Math.floor(Math.random()*16)+5;
            power += powerChange;

            resultText = "Repair successful.";

        }

        if(power > maxPower) power = maxPower;
        if(power < 0) power = 0;

        if(lastLogMessage) await lastLogMessage.delete().catch(()=>{});

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

    }catch(err){
        console.error(err);
    }

    processingMessage = false;

});

// ----- Keep Alive Server -----
const app = express();
app.get('/',(req,res)=>res.send("Bot Alive"));
const PORT = process.env.PORT || 3000;
app.listen(PORT);

// ----- Bot Login -----
client.once('ready',()=>{
    console.log(`Logged in as ${client.user.tag}`);
    updatePowerMessage();
});

client.login(TOKEN);
