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

// ----- Trivia Tracking -----
let triviaActive = false;

// ----- Trivia Questions -----
const triviaPool = [
    { question: "What is 9 plus 10?", answer: "19" },
    { question: "Why was 6 afraid of seven?", answer: ["789","67"] },
    { question: "Who is the bestest backaways member?", answer: "Tyro" },
    { question: "GLORY GREATEST COUNTRY!!!", answer: ["Glory to arstotzka","Arstotzka"] }
];

// ----- Update Power Bar -----
async function updatePowerMessage() {

    const channel = client.channels.cache.get(powerChannelId);
    if (!channel) return;

    const barLength = 20;
    const filled = Math.floor((power/maxPower)*barLength);
    const empty = barLength-filled;
    const bar = '█'.repeat(filled)+'░'.repeat(empty);

    if(!powerMessage)
        powerMessage = await channel.send(`Power: ${bar} (${power}%)`);
    else
        await powerMessage.edit(`Power: ${bar} (${power}%)`);
}

// ----- Power Decay Interval -----
setInterval(async () => {

    const channel = client.channels.cache.get(powerChannelId);
    if(!channel) return;

    if(power>0){
        power -= powerDecay;
        if(power<0) power=0;
    }

    await updatePowerMessage();

    if(power===0 && !isLocked){

        isLocked=true;

        await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{SendMessages:false});

        if(lastOperatorId){

            const member = await channel.guild.members.fetch(lastOperatorId).catch(()=>null);
            const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);

            if(member && role){
                await member.roles.add(role).catch(()=>{});
                missingUserId = member.id;
            }

        }

        recoveryTimeout=setTimeout(async()=>{

            power+=recoveryAmount;
            if(power>maxPower) power=maxPower;

            await channel.permissionOverwrites.edit(channel.guild.roles.everyone,{SendMessages:true});

            if(missingUserId){

                const member = await channel.guild.members.fetch(missingUserId).catch(()=>null);
                const role = await channel.guild.roles.fetch(missingRoleId).catch(()=>null);

                if(member && role)
                    await member.roles.remove(role).catch(()=>{});

                missingUserId=null;
            }

            isLocked=false;

            await updatePowerMessage();

        },recoveryDelay);

    }

},intervalMs);

// ----- Message Handler -----
client.on('messageCreate', async msg => {

    if(msg.author.bot) return;

    if(msg.channel.id !== powerChannelId) return;

    const channel = msg.channel;

    // Prevent generator interaction during trivia
    if(triviaActive) return;

    // ----- SABOTAGE -----
    if(msg.author.id === saboteurUserId && /^\d+$/.test(msg.content.trim())){

        const number=parseInt(msg.content.trim());
        await msg.delete().catch(()=>{});

        if(number===1 && !triviaActive){

            triviaActive=true;

            const role = await msg.guild.roles.fetch(backawaysRoleId).catch(()=>null);
            if(!role) return;

            const randomTrivia = triviaPool[Math.floor(Math.random()*triviaPool.length)];

            const triviaMsg = await channel.send(`${role} Answer quickly: ${randomTrivia.question}`);

            const filter = m =>
                !m.author.bot &&
                !(m.author.id === saboteurUserId && /^\d+$/.test(m.content));

            const collector = channel.createMessageCollector({
                filter,
                max:1,
                time:10000
            });

            collector.on('collect', async answerMsg=>{

                await answerMsg.delete().catch(()=>{});
                await triviaMsg.delete().catch(()=>{});

                const input = answerMsg.content.trim().toLowerCase();

                const correct = Array.isArray(randomTrivia.answer)
                ? randomTrivia.answer.map(a=>a.toLowerCase()).includes(input)
                : input===randomTrivia.answer.toLowerCase();

                triviaActive=false;

                if(correct){

                    const flavor = await channel.send(`***A frustrated groan is heard somewhere nearby...***\nNothing happened.`);

                    setTimeout(()=>flavor.delete().catch(()=>{}),5000);

                }else{

                    power-=25;
                    if(power<0) power=0;

                    const flavor = await channel.send(`***A brief chuckle echoes... sparks fly from the generator.***\nPower lost.`);

                    setTimeout(()=>flavor.delete().catch(()=>{}),5000);

                    await updatePowerMessage();
                }

            });

            collector.on('end', async collected=>{

                if(collected.size===0){

                    triviaActive=false;

                    await triviaMsg.delete().catch(()=>{});

                    power-=35;
                    if(power<0) power=0;

                    const flavor = await channel.send(`***A loud THUD echoes through the generator room...***`);

                    setTimeout(()=>flavor.delete().catch(()=>{}),5000);

                    await updatePowerMessage();

                }

            });

        }

        return;

    }

    // ----- NORMAL GENERATOR OPERATION -----

    if(processingMessage) return;
    processingMessage=true;

    try{

        lastOperatorId = msg.author.id;

        const originalMessage = msg.content;

        await msg.delete().catch(()=>{});

        let powerChange;
        let resultText;

        const roll=Math.random();

        const criticalFailureChance=0.01;
        const criticalSuccessChance=0.01;

        if(roll<criticalFailureChance){

            powerChange=-Math.floor(Math.random()*26)-50;

            resultText=`!!!CRITICAL FAILURE!!!`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalFailureRoleId).catch(()=>null);

            if(member && role)
                await member.roles.add(role).catch(()=>{});

        }

        else if(roll>1-criticalSuccessChance){

            powerChange=Math.floor(Math.random()*26)+50;

            resultText=`!!!CRITICAL SUCCESS!!!`;

            const member = await msg.guild.members.fetch(msg.author.id).catch(()=>null);
            const role = await msg.guild.roles.fetch(criticalSuccessRoleId).catch(()=>null);

            if(member && role)
                await member.roles.add(role).catch(()=>{});

        }

        else if(roll<0.15){

            powerChange=-(Math.floor(Math.random()*11)+5);

            if(powerChange>=-7)
                resultText=`Idiot detected.\nMinor damage caused.`;
            else if(powerChange>=-11)
                resultText=`3RR0R.\nSY5T3M D4M4G3 DETECTED.`;
            else
                resultText=`[01011001 01001111]`;

        }

        else{

            powerChange=Math.floor(Math.random()*16)+5;

            if(powerChange<=8)
                resultText=`System stabilization successful.\nMediocre performance detected.`;
            else if(powerChange<=14)
                resultText=`System stabilization successful.\nMechanical services acceptable.`;
            else
                resultText=`Major repair completed.\nEfficiency restored.`;

        }

        power+=powerChange;

        if(power<0) power=0;
        if(power>maxPower) power=maxPower;

        if(lastLogMessage)
            await lastLogMessage.delete().catch(()=>{});

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

    }finally{

        processingMessage=false;

    }

});

// ----- Web Server -----
const app = express();
app.get('/',(req,res)=>res.send("Bot alive"));
app.listen(3000);

// ----- Login -----
client.once('ready',()=>{

    console.log(`Logged in as ${client.user.tag}`);

    updatePowerMessage();

});

client.login(TOKEN);
