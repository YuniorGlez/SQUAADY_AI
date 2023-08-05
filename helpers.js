const { Configuration, OpenAIApi } = require("openai");
const { LinearClient } = require('@linear/sdk');

const linearClient = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY,
    accessToken: process.env.APP_TOKEN
})

function millisecondsToStr(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    const remainingSeconds = seconds % 60;
    const remainingMinutes = minutes % 60;
    const remainingHours = hours % 24;

    let str = "";
    if (days > 0) {
        str += `${days}d `;
    }
    if (remainingHours > 0) {
        str += `${remainingHours}h `;
    }
    if (remainingMinutes > 0) {
        str += `${remainingMinutes}m `;
    }
    if (remainingSeconds > 0) {
        str += `${remainingSeconds}s`;
    }
    return str.trim();
}
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);
function replaceTemplateVars(template, vars) {
    return template.replace(/\${(.*?)}/g, function(match, varName) {
        if(varName.includes('.')) {
            return vars[varName.split('.')[0]][varName.split('.')[1]] || '';
        }else{
            return vars[varName] || '';
        }
    });
}

module.exports = { millisecondsToStr, openai, linearClient, replaceTemplateVars };