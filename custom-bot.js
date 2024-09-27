var botId = "st-7d2ac320-109a-5721-8a1f-60a5faab9b71";
var botName = "Book Movie Tickets";
var sdk = require("./lib/sdk");
var botVariables = {};
var langArr = require('./config.json').languages;
var _ = require('lodash');
var dataStore = require('./dataStore.js').getInst();
var debug = require('debug')("Agent");
var first = true;
var jwt = require("jwt-simple");
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
var sdk                 = require("./lib/sdk");
var api                 = require('./LiveChatAPI.js');
var _                   = require('lodash');
var config              = require('./config.json');
const { makeHttpCall } = require("./makeHttpCall.js");
var debug               = require('debug')("Agent");
var _map                = {}; //used to store secure session ids //TODO: need to find clear map var
var userDataMap         = {};//this will be use to store the data object for each user

/**
 * connectToAgent
 *
 * @param {string} requestId request id of the last event
 * @param {object} data last event data
 * @returns {promise}
 */
function connectToAgent(data,history,cb){
    var formdata = {};
    formdata.licence_id = config.liveagentlicense;
    formdata.welcome_message = "";
    var visitorId = _.get(data, 'channel.channelInfos.from');
    if(!visitorId){
        visitorId = _.get(data, 'channel.from');
    }
    userDataMap[visitorId] = data;
    data.message="An Agent will be assigned to you shortly!!!";
    sdk.sendUserMessage(data, cb);
    sdk.startAgentSession(data, cb);
    formdata.welcome_message = "Link for user Chat history with bot: "+ config.app.url +"/history/index.html?visitorId=" + visitorId;
    formdata.body = JSON.stringify(history);
    return api.initChat(visitorId, formdata)
         .then(function(res){
             _map[visitorId] = {
                 secured_session_id: res.secured_session_id,
                 visitorId: visitorId,
                 last_message_id: 0
            };
        });
}

function onBotMessage(requestId, data, cb){
    debug("Bot Message Data",data);
    var visitorId = _.get(data, 'channel.from');
    var entry = _map[visitorId];
    if(data.message.length === 0 || data.message === '') {
        return;
    }
    var message_tone = _.get(data, 'context.dialog_tone');
    if(message_tone && message_tone.length> 0){
        var angry = _.filter(message_tone, {tone_name: 'angry'});
        if(angry.length){
            angry = angry[0];
            if(angry.level >=2){
                connectToAgent(requestId, data);
            }
            else {
                sdk.sendUserMessage(data, cb);
            }
        }
        else {
            sdk.sendUserMessage(data, cb);
        }
    }
    else if(!entry)
    {
        sdk.sendUserMessage(data, cb);
    }else if(data.message === "skipUserMessage"){ // condition for skipping a user message
	sdk.skipUserMessage(data, cb);
    }
}

async function downloadAndConvertToBuffer(data) {
    try {
        let fileType = data[0].fileName.split(".")[1];
        let fileName =data[0].fileName.split(".")[0];
      // Download the file as a stream (or arraybuffer for smaller files)
      let url = data[0]?.url?.fileUrl;
      const response = await axios({
        url,
        method: 'GET',
        responseType: 'arraybuffer' // Receive binary data as an ArrayBuffer
      });
  
      // Convert the downloaded file into a Buffer
      const fileBuffer = Buffer.from(response.data);
      return {fileBuffer,fileType,fileName}; // Return the buffer for further usage
    } catch (error) {
      console.error('Error downloading the file:', error);
    }
  }
  function saveBufferAsFile(data) {
    const outputFilePath = `./files/${data.fileName}.${data.fileType}`; 
    // Write the buffer content to a new file
    fs.writeFileSync(outputFilePath, data.fileBuffer);
    console.log(`File saved to ${outputFilePath}`);
  }
// async function readAttachment(data){
//     let fileType = data[0].fileName.split(".")[1];
//     let fileName =data[0].fileName.split(".")[0];
//     let response = await makeHttpCall('get',data[0]?.url?.fileUrl,{ responseType: 'arraybuffer' })
//     const buffer = Buffer.from(response.data, 'binary');
//     const filePath = path.join(__dirname, 'uploads', `${fileName}-${Date.now()}.${fileType}`);
//     fs.writeFile(filePath, buffer, (err) => {
//         if (err) {
//           console.error('Error writing file:', err);
//           return res.status(500).send('Failed to save file.');
//         }
//         res.send(`File saved successfully at ${filePath}`);
//       });
//     console.log(buffer)
// }


 async function onUserMessage(requestId, data, cb){
    debug("user message", data);
    // read Attachment
    if(data?.channel?.attachments){
        let resp =await downloadAndConvertToBuffer(data?.channel?.attachments)
        saveBufferAsFile(resp)
    }
    var visitorId = _.get(data, 'channel.from');
    var entry = _map[visitorId];
    if(entry){//check for live agent
        //route to live agent
        var formdata = {};
        formdata.secured_session_id = entry.secured_session_id;
        formdata.licence_id = config.liveagentlicense;
        formdata.message = data.message;
        return api.sendMsg(visitorId, formdata)
            .catch(function(e){
                console.error(e);
                delete userDataMap[visitorId];
                delete _map[visitorId];
                return sdk.sendBotMessage(data, cb);
            });
    }
    else {
        if(data.message == 'agent'){
            // return sdk.getMessages(data, cb)
            let history = await gethistory(data);
            return connectToAgent(data,history,cb);
        //    return sdk.closeConversationSession(data, cb)

        }
	if(data.message === "skipBotMessage") // condition for skipping a bot message
            return sdk.skipBotMessage(data, cb);
        else    
            return sdk.sendBotMessage(data, cb);
    }
}

function getSignedJWTToken(botId) {
    var appId, apiKey, jwtAlgorithm, jwtExpiry;
    var defAlg = "HS256";
    appId = process.env.CLIENT_ID
    apiKey = process.env.CLIENT_SECRET

    // if (config.credentials[botId]) {
    //     appId = config.credentials[botId].appId;
    //     apiKey = config.credentials[botId].apikey;
    // } else {
    //     appId = process.env.CLIENT_ID
    //     apiKey = process.env.CLIENT_SECRET
    // }

    if (config.jwt[botId]) {
        jwtAlgorithm = config.jwt[botId].jwtAlgorithm;
        jwtExpiry = config.jwt[botId].jwtExpiry;
    } else {
        jwtAlgorithm = config.jwt.jwtAlgorithm;
        jwtExpiry = config.jwt.jwtExpiry;
    }

    return jwt.encode({ 
        appId: appId, 
        exp: Date.now()/1000 + (jwtExpiry || 60) //set the default expiry as 60 seconds
    }, apiKey, (jwtAlgorithm || defAlg));
}

function gethistory(requestData){  
    if(requestData) {     
        var limit  =  30;
        var offset = requestData.skip || 0;
        var userId = requestData.channel.handle.userId;
        var botId = 'st-7d2ac320-109a-5721-8a1f-60a5faab9b71'
        //var url    = requestData.baseUrl + '/getMessages?' + "skip=" + offset + "&limit=" + limit + "&userId=" + userId;        
        var url    = `https://bots.kore.ai/api/public/bot/${botId}/getMessages?&limit=${limit}&userId=${userId}`;
        var botId  = url.split("/")[6];   
        console.log("botId value" + botId);

        var headers;
        if (!headers) {
            headers = {};   
        }
        headers['content-type'] = 'application/json';
        headers.auth = getSignedJWTToken(botId);
        const body   = {}
        return makeHttpCall('get',url,body,headers)
        .then(function(res){    
            const filtered = res.data.messages.map(obj => ({
                type: obj.type === "outgoing" ? "bot" : "user",
                text: obj.components[0]?.data?.text || "No text found"
              }));
              console.log(filtered)
            return res.data.messages;
        }).catch(function(err){
            console.log(err);        
        }); 
    }
}


function onAgentTransfer(requestId, data, callback){
    connectToAgent(requestId, data, callback);
}

module.exports = {
    botId: botId,
    botName: botName,

    on_user_message :async function(requestId, data, callback) {
        debug('on_user_message');
        onUserMessage(requestId, data, callback);
    },
    on_bot_message : function(requestId, data, callback) {
        debug('on_bot_message');
        onBotMessage(requestId, data, callback);
    },
    on_agent_transfer : function(requestId, data, callback) {
        debug('on_webhook');
        onAgentTransfer(requestId, data, callback);
    },
    on_event: function(requestId, data, callback) {
        fetchAllBotVariables(data);
        return callback(null, data);
    },
    on_alert: function(requestId, data, callback) {
        fetchAllBotVariables(data);
        return sdk.sendAlertMessage(data, callback);
    },
    on_variable_update: function(requestId, data, callback) {
        var event = data.eventType;
        if (first || event == "bot_import" || event == "variable_import" || event == "sdk_subscription" || event == "language_enabled") {
            // fetch BotVariables List based on language specific when there is event subscription/bulkimport
            sdk.fetchBotVariable(data, langArr, function(err, response) {
                dataStore.saveAllVariables(response, langArr);
                first = false;
            });
        } else {
            var lang = data.language;
            //update Exixting BotVariables in Storage
            updateBotVariableInDataStore(botVariables, data, event, lang);
        }
        console.log(dataStore);

    },
    gethistory: gethistory

};

function updateBotVariableInDataStore(botVariables, data, event, lang) {
    var variable = data.variable;
    if (event === "variable_create") {
        //update storage with newly created variable
        for (var i = 0; i < langArr.length; i++) {
            dataStore.addVariable(variable, i);
        }
    } else if (event == "variable_update") {
        //update storage with updated variable
        var index = langArr.indexOf(lang);
        if (index > -1) {
            dataStore.updateVariable(variable, langArr, index);
        }
    } else if (event == "variable_delete") {
        //delete variable from storage
        dataStore.deleteVariable(variable, langArr);
    }
}

function fetchAllBotVariables(data) {
    if (first) {
        sdk.fetchBotVariable(data, langArr, function(err, response) {
            first = false;
            dataStore.saveAllVariables(response, langArr);
        });
    }
}