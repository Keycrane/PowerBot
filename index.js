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

// ----- Runtime State -----
let powerMessage = null;
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
    { question: "What is 9 plus 10?", answer: "19" },
    { question: "Why was 6 afraid of seven?", answer: ["789","67"] },
    { question: "Who is the bestest backaways member?", answer: "Tyro" },
    { question: "GLORY GREATEST COUNTRY!!!", answer: ["Glory to arstotzka","Arstotzka"] },
    { question: "What is BA-1s original STEAM username?", answer: "Killer" },
    { question: "What is blue and smells like red paint?", answer: "Blue paint" },
    { question: "Name one of my dogs", answer: ["Jingle","Oakley","Bear","tiny"] }
];

let triviaActive = false;

// ----- Update Power Bar -----
async function updatePowerMessage(){

    const channel = client.channels.cache.get(powerChannelId);
    if(!channel) return;

    const barLength = 20;
    const filled = Math.floor((power/maxPower)*barLength);
    const empty = barLength-filled;

    const bar = "█".repeat(filled) + "░".repeat(empty);

    const text = `Power: ${bar} (${power}%)`;

    if(!powerMessage){

        powerMessage = await channel.send(text);

    } else {

        try{
            await powerMessage.edit(text);
        }catch{
            powerMessage = await channel.send(text);
        }

    }

}

// ----- Power Decay -----
setInterval(async ()=>{

    try{

        const channel = client.channels.cache.get(powerChannelId);
        if(!channel) return;

        if(power>0){
            power -= powerDecay;
            if(power<0) power = 0;
        }

        await updatePowerMessage();

        // LOCK
        if(power===0 && !isLocked){

            await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{SendMessages:false});

            isLocked = true;

            slowChannels.forEach(id=>{
                const ch = client.channels.cache.get(id);
                if(ch) ch.setRateLimitPerUser(10).catch(()=>{});
            });

            // give missing role
            if(lastOperatorId){

                const member = await channel.guild.members.fetch(lastOperatorId).catch(()=>null);
                const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);

                if(member && role){
                    await member.roles.add(role).catch(()=>{});
                    missingUserId = member.id;
                }

            }

            // recovery timer
            recoveryTimeout = setTimeout(async ()=>{

                power += recoveryAmount;
                if(power>maxPower) power = maxPower;

                await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{SendMessages:true});

                slowChannels.forEach(id=>{
                    const ch = client.channels.cache.get(id);
                    if(ch) ch.setRateLimitPerUser(0).catch(()=>{});
                });

                if(missingUserId){

                    const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                    const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);

                    if(member && role){
                        await member.roles.remove(role).catch(()=>{});
                    }

                    missingUserId = null;

                }

                isLocked = false;

                await updatePowerMessage();

            },recoveryDelay);

        }

    }catch(err){
        console.error(err);
    }

},intervalMs);

// ----- Message Handler -----
client.on('messageCreate', async msg=>{

    if(msg.author.bot) return;

    if(msg.channel.id !== powerChannelId) return;

    if(triviaActive) return;

    if(processingMessage) return;

    processingMessage = true;

    try{

        lastOperatorId = msg.author.id;

        const originalMessage = msg.content;

        await msg.delete().catch(()=>{});

        const roll = Math.random();

        let powerChange = 0;
        let resultText = "";

        if(roll < 0.01){

            powerChange = -50;
            resultText = "!!!CRITICAL FAILURE!!!";

        }
        else if(roll > 0.99){

            powerChange = 50;
            resultText = "!!!CRITICAL SUCCESS!!!";

        }
        else if(roll < 0.15){

            powerChange = -(Math.floor(Math.random()*11)+5);
            resultText = "Repair attempt failed.";

        }
        else{

            powerChange = Math.floor(Math.random()*16)+5;
            resultText = "Repair successful.";

        }

        power += powerChange;

        if(power<0) power=0;
        if(power>maxPower) power=maxPower;

        if(lastLogMessage){
            await lastLogMessage.delete().catch(()=>{});
        }

        lastLogMessage = await msg.channel.send(
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

app.get('/',(req,res)=>res.send("Bot alive"));

app.listen(process.env.PORT || 3000);

// ----- Startup Scan (Prevents Duplicate Messages) -----
client.once('ready', async ()=>{

    console.log(`Logged in as ${client.user.tag}`);

    const channel = client.channels.cache.get(powerChannelId);

    if(!channel) return;

    try{

        const messages = await channel.messages.fetch({limit:50});

        powerMessage = messages.find(m =>
            m.author.id === client.user.id &&
            m.content.startsWith("Power:")
        );

        lastLogMessage = messages.find(m =>
            m.author.id === client.user.id &&
            m.content.startsWith("POWER GRID TERMINAL")
        );

    }catch(err){
        console.error("Startup scan error:",err);
    }

    await updatePowerMessage();

});

client.login(TOKEN);
