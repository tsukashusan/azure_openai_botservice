// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');
const sprintf = require('sprintf-js').sprintf;
const https = require('https');
const OPEN_AI_URL = process.env.OPEN_AI_URL;
const OPEN_AI_MODEL_NAME = process.env.OPEN_AI_MODEL_NAME;
const CONFIG = {
    headers: {
        "content-type": "application/json",
        "api-key": process.env.OPEN_AI_KEY
    }
};

const messageTemplete_ = { role: "system", content: process.env.GPT_SYSTEM_SETTING };
class EchoBot extends ActivityHandler {

    constructor() {
        super();
        this.messageArray = {};
        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            const replyText = `${context.activity.text}`;
            await this.setmessage(context.activity.recipient.id, { role: "user", content: replyText });
            var reqest2OpenAI = this.messageArray[context.activity.recipient.id];
            var res = await this.requestOpenAI(reqest2OpenAI, context.activity.recipient.id);
            var answer = res.choices[0].message.content;
            await this.setmessage(context.activity.recipient.id, res.choices[0].message);
            await context.sendActivity(MessageFactory.text(answer, answer));
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            const welcomeText = 'こんにちは。何でも聞いてください🙇‍♂️';
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
                }
            }
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

    }
    async setmessage(id, message) {
        if (this.messageArray[id] !== undefined) {
            this.messageArray[id].push(message)
        } else {
            this.messageArray[id] = [messageTemplete_,
                message];
        }
    }
    async requestOpenAI(msg, id) {
        let OPENAI_API_BASE = sprintf("https://%s/openai/deployments/%s/chat/completions?api-version=2023-03-15-preview", OPEN_AI_URL, OPEN_AI_MODEL_NAME)
        var body =
        {
            messages: msg
        };
        var responseData = [];
        var ret = "";
        try {
            let promise = new Promise((resolve, reject) => {
                const requestData = JSON.stringify(body);
                const options = {
                    method: "POST",
                    headers: CONFIG.headers,
                };
                const url = OPENAI_API_BASE;
                const request = https.request(url, options, (res) => {
                    res.on('data', (chunk) => {
                        responseData.push(chunk);
                    }).on('end', () => {
                        ret = JSON.parse(Buffer.concat(responseData));
                        resolve(ret);
                    }).on('error', (e) => {
                        Console.log(e);
                        console.log("Got error: " + e.message);
                        context.done(null, 'FAILURE');
                        reject(e);
                    });
                });
                request.write(requestData);
                request.end();
            });
            ret = await promise;
            
            //ret = await axios.post(OPENAI_API_BASE, body, config);
            console.log(ret);
        } catch (e) {
            console.log(e);
            this.messageArray[id] = undefined;

        }
        if (ret.data !== undefined) {
            return ret.data;
        } else {
            return ret;
        }
    }
}
module.exports.EchoBot = EchoBot;
