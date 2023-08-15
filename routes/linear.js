const SheetService = require('../services/sheetService');
const { millisecondsToStr, openai, linearClient, replaceTemplateVars } = require('./../helpers');

const router = require('express').Router();
const ongoingChats = {};


router.get('/app-callback', async (req, res) => {
    console.log('Llamada al callback');
    console.log({ req });
    return res.send('Ok')
})
router.get('/app-webhooks', async (req, res) => {
    const { type, data } = req.body;
    console.log('Llamada de la app');
    console.log({ type });
    console.log({ data });
    return res.send('Ok');
})
router.post('/webhooks', async (req, res) => {
    const { type, data } = req.body;
    let openaiResponse;
    if (type === 'Comment' && data.body) {
        let comment = data.body.trim();
        const issueId = data.issue.id;
        const issue = await linearClient.issue(issueId);
        
        if (comment.startsWith('/')) {
            const parts = comment.split(' ');
            const command = parts[0];
            const customPrompt = parts.slice(1).join(' ').trim();

            let sheetPrompt;
            if (command === '/continue') {
                sheetPrompt = ''; 
            } else {
                sheetPrompt = await SheetService.getPrompt(command); 
            }

            if (sheetPrompt !== null) {
                let templateData = {
                    issue: {
                        title: issue.title,
                        description: issue.description
                    }
                };
                
                // Check for IDS and populate the issues
                if (comment.includes('IDS:')) {
                    let idsString = comment.match(/IDS:\[(.*?)\]/)[1]; 
                    let taskIDs = idsString.split(',').map(t => `${issue.identifier.split('-')[0]}-${t.trim()}`);
                    const issues = await Promise.all(taskIDs.map(id => linearClient.issue(id)));
                    templateData.issues = issues.map(i => `ID: ${i.identifier}  TITLE:  ${i.title} DESCRIPCION: ${i.description}`).join('\n');
                }

                let prompt = replaceTemplateVars(sheetPrompt, templateData);
                
                if (customPrompt) {
                    if (prompt.includes('${customPrompt}')) {
                        prompt = prompt.replace('${customPrompt}', customPrompt);
                    } else {
                        prompt += ` Adicionalmente, quería comentarte lo siguiente: ${customPrompt}`;
                    }
                }

                if (!ongoingChats[issueId] || comment.includes('forceNewChat:true')) {
                    ongoingChats[issueId] = [];
                }
                
                ongoingChats[issueId].push({ role: "user", content: prompt });
                openaiResponse = await interactWithGPT({ messages: ongoingChats[issueId] });
                
                ongoingChats[issueId].push({ role: "assistant", content: openaiResponse });
                await addCommentToTask(issue.id, openaiResponse);
            } else {
                await addCommentToTask(issue.id, "Comando no reconocido o no definido.");
            }
        }
    }
    return res.send(openaiResponse);
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

router.post('/gpt-response/:issueId', async (req, res) => {
    const { issueId } = req.params;
    const { language, additionalInfo } = req.body; // Nuevos campos del formulario

    try {
        const issue = await linearClient.issue(issueId);
        const prompt = `Somos una empresa de desarrollo de software y estamos utilizando Linear para gestionar nuestras tareas. La tarea que tenemos a continuación proviene de Linear y necesitamos una posible solución de código utilizando ${language}.

        ${additionalInfo}

            "${issue.title} - ${issue.description}". ¿Cómo podría abordarlo?`;

        const openaiResponse = await openai.createChatCompletion({
            model: "gpt-4",
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

async function interactWithGPT(data) {
    const messages = data.messages;
    const openaiResponse = await openai.createChatCompletion({
        model: "gpt-4",
        messages: messages
    });
    return openaiResponse.data.choices[0].message.content.trim();
}

async function addCommentToTask(taskId, description) {
    // Aquí es donde usarías la API de Linear para agregar el comentario a la tarea
    // De nuevo, puedes adaptar esto a tus necesidades específicas, por ejemplo, puedes decidir cómo quieres formatear el comentario, etc.
    const response = await linearClient.createComment({ issueId: taskId, body: description });
    return response.success;
}



module.exports = router;
