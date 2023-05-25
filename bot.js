// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');
const sprintf = require('sprintf-js').sprintf;
const https = require('https');
const OPEN_AI_URL = process.env.OPEN_AI_URL;
const OPEN_AI_MODEL_NAME = process.env.OPEN_AI_MODEL_NAME;
const OPEN_AI_API_VESION = process.env.OPEN_AI_API_VERSION
const CONFIG = {
    headers: {
        "content-type": "application/json",
        "api-key": process.env.OPEN_AI_KEY
    }
};
const TEMPLATE = [
    {
        WELCOME_TEXT: process.env.WELCOME_TEXT1 !== undefined ? process.env.WELCOME_TEXT_1 : "どんなご用件でしょうか。\nどんな要件でも承ります🙇‍♂️",
        messageTemplete: { role: "system", content: process.env.GPT_SYSTEM_SETTING_1 },
        CHANGE_TEXT: process.env.CHANGE_TEXT_1
    },
    {
        WELCOME_TEXT: process.env.WELCOME_TEXT2 !== undefined ? process.env.WELCOME_TEXT_2 : "どんなご用件でしょうか。\nどんな要件でも承ります🙇‍♂️",
        messageTemplete: { role: "system", content: process.env.GPT_SYSTEM_SETTING_2 },
        CHANGE_TEXT: process.env.CHANGE_TEXT_2
    }
];
const FIRST_CHARACTER_NUMBER = 0;
const TOKEN_COEFFICIENT = 1.2;
const MODEL = "gpt-35-turbo";
const MAX_TOKEN = { "gpt-35-turbo": process.env.MAX_TOKEN };
const CONTENT_INDEX_NUMBER = 0;
const CHARACTER_NUMBER_INDEX = 1;
const CHANGE_TEXT_INDEX = 2;


const BUF = process.env.BUFFER;

class EchoBot extends ActivityHandler {
    constructor() {
        super();

        this.messageArray = {};
        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        this.onMessage(async (context, next) => {
            const replyText = `${context.activity.text}`;
            console.log('context.activity.recipient.id', context.activity.recipient.id);
            await context.sendActivity({type: 'typing'});
            var character_number = await this.getCharacter_number(context.activity.recipient.id);
            var usage = await this.getUsage(context.activity.recipient.id);
            await this.setMessage(context.activity.recipient.id, { role: "user", content: replyText }, usage, character_number);
            //var reqest2OpenAI = this.messageArray[context.activity.recipient.id];
            var reqest2OpenAI = await this.getMessage(context.activity.recipient.id, usage, replyText, MODEL);
            var changeTexgt = reqest2OpenAI[CHANGE_TEXT_INDEX];
            var content = reqest2OpenAI[CONTENT_INDEX_NUMBER];
            if (changeTexgt !== undefined && 0 < changeTexgt.length) {
                await context.sendActivity(MessageFactory.text(changeTexgt, changeTexgt));
            }
            var res = await this.requestOpenAI(content, context.activity.recipient.id);
            var notset = false;
            var answer = '';
            if (res.hasOwnProperty("error") && res.error.hasOwnProperty("code") && res.error.code === "429") {
                answer = "申し訳ありません。只今GPTが使いすぎのためしばらくお休みをしております。\n" + res.error.message;
                notset = true;
            } else if (res.hasOwnProperty("choices") && 0 < res.choices.length) {
                answer = res.choices[0].message.content;
            } else {
                console.log('res:', JSON.stringify(res));
                answer = JSON.stringify(res);
            }
            if (!notset) await this.setMessage(context.activity.recipient.id, res.choices[0].message, res.usage, reqest2OpenAI[CHARACTER_NUMBER_INDEX]);
            await context.sendActivity(MessageFactory.text(answer, answer));
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

        this.onMembersAdded(async (context, next) => {
            const membersAdded = context.activity.membersAdded;
            for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
                if (membersAdded[cnt].id !== context.activity.recipient.id) {
                    await context.sendActivity(MessageFactory.text(TEMPLATE[FIRST_CHARACTER_NUMBER].WELCOME_TEXT, TEMPLATE[FIRST_CHARACTER_NUMBER].WELCOME_TEXT));
                }
            }
            // By calling next() you ensure that the next BotHandler is run.
            await next();
        });

    }


    async firstMessage(message, usage, character_number) {
        return { content: [TEMPLATE[FIRST_CHARACTER_NUMBER].messageTemplete, message], usage: usage, character_number: character_number, model: "gpt-35-turbo" };
    }

    async setMessage(id, message, usage, character_number) {
        if (this.messageArray[id] !== undefined) {
            this.messageArray[id].content.push(message);
            this.messageArray[id].usage = usage;
            this.messageArray[id].character_number = character_number;
            //this.messageArray[id].push({content : message, usage: usage, character_number: character_number})
        } else {
            this.messageArray[id] = await this.firstMessage(message, usage, character_number);
        }
    }

    async getMessage(id, usage, replyText, model) {
        if (this.messageArray[id] !== undefined || this.messageArray[id] !== null) {
            if ((usage !== null && replyText !== null) && (MAX_TOKEN[model] < ((usage.total_tokens + BUF) + replyText.length / TOKEN_COEFFICIENT))) {
                var character_number = this.messageArray[id].character_number;
                if (FIRST_CHARACTER_NUMBER === this.messageArray[id].character_number) {
                    character_number = FIRST_CHARACTER_NUMBER + 1;
                } else {
                    character_number = FIRST_CHARACTER_NUMBER;
                }
                this.messageArray[id] = { content: [TEMPLATE[character_number].messageTemplete, { role: "user", content: replyText }], usage: null, character_number: character_number };
                return [this.messageArray[id].content, character_number, TEMPLATE[character_number].CHANGE_TEXT];
            } else {
                return [this.messageArray[id].content, this.messageArray[id].character_number, ""];
            }
        } else {
            this.messageArray[id] = { content: [TEMPLATE[FIRST_CHARACTER_NUMBER].messageTemplete, { role: "user", content: replyText }], usage: usage, character_number: FIRST_CHARACTER_NUMBER };
        }
    }

    async getCharacter_number(id) {
        if (this.messageArray[id] !== undefined) {
            return this.messageArray[id].character_number;
        } else {
            return FIRST_CHARACTER_NUMBER;
        }
    }

    async getUsage(id) {
        if (this.messageArray[id] !== undefined) {
            return this.messageArray[id].usage;
        } else {
            return null;
        }
    }

    async requestOpenAI(msg, id) {
        var url = "";
        var slashIndex = OPEN_AI_URL.lastIndexOf("/");
        var httpsIndex = OPEN_AI_URL.indexOf("https");
        if (slashIndex === (OPEN_AI_URL.length - 1) && httpsIndex === 0) {
            url = "%sopenai/deployments/%s/chat/completions?api-version=%s";
        } else if (slashIndex === (OPEN_AI_URL.length - 1)) {
            url = "https://%sopenai/deployments/%s/chat/completions?api-version=%s";
        } else if (httpsIndex === 0) {
            url = "%s/openai/deployments/%s/chat/completions?api-version=%s";
        } else {
            url = "https://%s/openai/deployments/%s/chat/completions?api-version=%s";
        }
        let OPENAI_API_BASE = sprintf(url, OPEN_AI_URL, OPEN_AI_MODEL_NAME, OPEN_AI_API_VESION)
        var body =
        {
            max_tokens: 4096,
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
