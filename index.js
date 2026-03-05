// ----- Required Modules -----
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

const powerDecay = 5;
const intervalMs = 60000; // 1 minute

const powerChannelId = '1017667058261041274';

const slowChannels = [
'1029276114641756251',
'1034745617399943178',
'1207493500929835048'
];

let powerMessage;
let isLocked = false;

// ----- Update Power Bar -----
async function updatePowerMessage(){

    const channel = client.channels.cache.get(powerChannelId);
    if(!channel || !channel.isTextBased()) return;

    const barLength = 20;

    const filled = Math.floor((power/100)*barLength);
    const empty = barLength - filled;

    const bar =
        "█".repeat(filled) +
        "░".repeat(empty);

    const text = `⚡ Power: ${bar} (${power}%)`;

    try{

        if(!powerMessage){

            const messages = await channel.messages.fetch({limit:5});

            powerMessage =
                messages.find(m => m.author.id === client.user.id);

        }

        if(!powerMessage){
            powerMessage = await channel.send(text);
        }else{
            await powerMessage.edit(text);
        }

    }catch(err){
        console.log(err);
    }

}

// ----- Power Interval -----
setInterval(async ()=>{

try{

    power -= powerDecay;

    if(power < 0)
        power = 0;

    await updatePowerMessage();

    const channel = client.channels.cache.get(powerChannelId);
    if(!channel || !channel.isTextBased()) return;

    // LOCK CHANNEL
    if(power === 0 && !isLocked){

        await channel.permissionOverwrites.edit(
            channel.guild.roles.everyone,
            {SendMessages:false}
        );

        console.log("Channel locked");

        isLocked = true;

        for(const id of slowChannels){
            const ch = client.channels.cache.get(id);
            if(ch && ch.isTextBased())
                await ch.setRateLimitPerUser(10);
        }

    }

    // UNLOCK CHANNEL
    if(power > 0 && isLocked){

        await channel.permissionOverwrites.edit(
            channel.guild.roles.everyone,
            {SendMessages:true}
        );

        console.log("Channel unlocked");

        isLocked = false;

        for(const id of slowChannels){
            const ch = client.channels.cache.get(id);
            if(ch && ch.isTextBased())
                await ch.setRateLimitPerUser(0);
        }

    }

}catch(err){
    console.log("Interval error:",err);
}

},intervalMs);

// ----- Power Increase From Messages -----
client.on("messageCreate",msg=>{

    if(msg.author.bot) return;

    power += 50;

    if(power > 100)
        power = 100;

});

// ----- Keep Alive Server -----
const app = express();

app.get("/",(req,res)=>res.send("Bot Alive"));

app.listen(3000,()=>{
    console.log("Web server running");
});

// ----- Bot Ready -----
client.once("ready",()=>{

    console.log(`Logged in as ${client.user.tag}`);

    updatePowerMessage();

});

// ----- Error Catching -----
process.on("unhandledRejection",err=>console.log(err));
process.on("uncaughtException",err=>console.log(err));

// ----- Login -----
client.login(TOKEN);