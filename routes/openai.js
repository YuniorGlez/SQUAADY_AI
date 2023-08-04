const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

router.post('/prompt', async (req, res) => {
    const { prompt } = req.body;
    try {
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        });
        res.json(response.data.choices[0].message);
    } catch (error) {
        res.status(500).json({ error });
    }
});

module.exports = router;
