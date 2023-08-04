const { LinearClient } = require('@linear/sdk');
const express = require('express');
const router = express.Router();
const { Configuration, OpenAIApi } = require("openai");

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const linearClient = new LinearClient({
    apiKey: process.env.LINEAR_API_KEY
})

router.post('/webhooks', (req, res) => {
    const { type, data } = req.body;

    console.log({ data });
    if (type === 'IssueMoved' && data.toName === 'In Production') {
        // generar descripción y añadir comentario
    }
    return res.send('Ok');
});


router.get('/projects', async (req, res) => {
    try {
        const me = await linearClient.viewer;
        const projects = await linearClient.projects();
        res.json(projects.nodes);
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

router.get('/issues/:slugId', async (req, res) => {
    const { slugId } = req.params;
    try {
        const issues = await linearClient.issues({ filter: { project: { slugId: { eq: slugId } } } });
        res.json(issues.nodes);
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});
router.get('/generate-comment/:slugId', async (req, res) => {
    const { slugId } = req.params;
    try {
        const issues = await linearClient.issues({ filter: { project: { slugId: { eq: slugId } } } });
        if (issues.nodes.length > 0) {
            // Seleccionamos el primer problema
            const firstIssue = issues.nodes[0];
            // Obtenemos la descripción del problema
            const issueDescription = firstIssue.description;

            const prompt = `Hola GPT-3. Tengo un problema relacionado con un proyecto y necesito tu ayuda. Aquí está la descripción del problema: "${issueDescription}". ¿Podrías proporcionarme una solución práctica para este problema?`;

            // Enviamos la descripción a la API de OpenAI
            const response = await openai.createChatCompletion({
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: prompt }]
            });
            // Respondemos con el mensaje generado por OpenAI
            res.json(response.data.choices[0].message);
        } else {
            // No hay problemas en este proyecto
            res.json({ message: "No issues found for this project." });
        }
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

router.post('/gpt-response/:issueId', async (req, res) => {
    const { issueId } = req.params;
    const { language, additionalInfo } = req.body; // Nuevos campos del formulario

    try {
        const issue = await linearClient.issue(issueId);
        const prompt = `Somos una empresa de desarrollo de software y estamos utilizando Linear para gestionar nuestras tareas. La tarea que tenemos a continuación proviene de Linear y necesitamos una posible solución de código utilizando ${language}.

${additionalInfo}

"${issue.title} - ${issue.description}". ¿Cómo podría abordarlo?`;

        const openaiResponse = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [{ role: "user", content: prompt }]
        });

        res.json(openaiResponse.data.choices[0].message);
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});

router.get('/issue/:issueId', async (req, res) => {
    const { issueId } = req.params;

    try {
        const issue = await linearClient.issue(issueId);
        const createdAt = issue.createdAt; // Fecha de creación
        const currentState = (await issue.state)?.name; // Estado actual
        const assignee = (await issue.assignee)?.name; // Persona asignada

        // Calculamos cuánto tiempo ha estado en su estado actual
        const currentStateDuration = Date.now() - new Date(issue.updatedAt);

        res.json({
            createdAt,
            currentState,
            currentStateDuration,
            assignee,
        });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});
router.get('/enhanced-metrics', async (req, res) => {
    try {
        // Obtenemos todos los problemas
        const issues = await linearClient.issues();
        const issueData = await Promise.all(issues.nodes.map(async issue => {
            const createdAt = issue.createdAt;
            const currentState = (await issue.state)?.name;
            const currentStateDuration = Date.now() - new Date(issue.updatedAt);
            const assignee = (await issue.assignee)?.name;
            return {
                createdAt,
                currentState,
                currentStateDuration,
                assignee,
            };
        }));

        // Agrupamos las issues por estado
        const issuesByState = issueData.reduce((acc, issue) => {
            if (!acc[issue.currentState]) {
                acc[issue.currentState] = [];
            }
            acc[issue.currentState].push(issue);
            return acc;
        }, {});

        // Calculamos el tiempo promedio en el estado actual para cada estado
        const avgCurrentStateDurationByState = Object.fromEntries(Object.entries(issuesByState).map(([state, issues]) => {
            const avgDuration = issues.reduce((sum, issue) => sum + issue.currentStateDuration, 0) / issues.length;
            return [state, millisecondsToStr(avgDuration)];
        }));

        res.json({
            avgCurrentStateDurationByState,
        });
    } catch (error) {
        res.status(500).json({ error: error.toString() });
    }
});
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


module.exports = router;
