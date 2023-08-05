const SheetService = require('../services/sheetService');
const { millisecondsToStr, openai, linearClient, replaceTemplateVars } = require('./../helpers');

const router = require('express').Router();

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
    if (type === 'Comment' && data.body) {
        let comment = data.body;
        const issueId = data.issue.id;
        const issue = await linearClient.issue(issueId);
        let model = 'gpt-4';
        let customPrompt = comment;
        if (comment.includes('model:')) {
            let startIndex = comment.indexOf('model:') + 'model:'.length;
            model = comment.substring(startIndex).split(' ')[0];
            customPrompt = comment.substring(startIndex + model.length);
        }
        if (comment && comment.startsWith('/description')) {
            // Generate a client-friendly description and add it as a comment
            const friendlyDescription = await getFriendlyDescription({ issue, customPrompt, model });
            await addCommentToTask(issue.id, friendlyDescription);
        } else if (comment && comment.startsWith('/code')) {
            // Here you would handle generating code based on the issue's description or some other functionality
        } else if (comment && comment.startsWith('/report')) {
            let taskIDs = [];
            if (comment.includes('IDS:')) {
                console.log({ comment });
                comment = comment.replaceAll(/\\/gi, "");
                console.log({ comment });
                let idsString = comment.match(/IDS:\[(.*?)\]/)[1]; // IDS:[a,b,c,d] a,b,c,d
                taskIDs.push(...idsString.split(',').map(t => `${issue.identifier.split('-')[0]}-${t.trim()}`));
            } else {
                let currentState = await issue.state;
            }
            const issues = (await Promise.all(taskIDs.map(async t => {
                const issueInfo = (await linearClient.issue(t));
                return `Tarea ${t}: ${issueInfo.title} 
                Descripción: ${issueInfo.description}
                `
            }))).join('/n')
            const gptResponse = await getFriendlyReport({ issues, customPrompt, model })
            await addCommentToTask(issue.id, gptResponse);

            // Here you would handle generating a report for the issue
        }
    }

    res.sendStatus(200);
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

async function getFriendlyDescription({ issue, customPrompt = '', model = 'gpt-4' }) {
    const prompt = `"Hola, soy un product manager que necesita proporcionar una actualización a nuestro cliente. Hemos completado la tarea '${issue.title} - ${issue.description}'. Necesito presentar esta tarea desde tres diferentes perspectivas: como una solución a un problema, cómo afectará al usuario final y qué valor aporta al negocio. 

    Por favor, ayúdame a reformular esta tarea en términos sencillos y no técnicos que sean fáciles de entender para el cliente. Recuerda, cada descripción debe ser concisa, con un máximo de 250 caracteres.
    
    Por último, quiero que cada respuesta esté lista para ser copiada, pegada y enviada a un cliente directamente. Por lo tanto, asegúrate de que cada bloque de respuesta sea un mensaje completo y coherente.
    
    Bloque 1 - ### solución: 
    
    Podrías ayudarme a reformular esto en términos sencillos que describan el problema que hemos resuelto y cómo hemos solucionado el problema?
    
    Bloque 2 - ### usuario: 
    
    Podrías ayudarme a explicar cómo esta tarea impactará positivamente en los usuarios finales en una sola oración?
    
    Bloque 3 - ### negocio:
    
    Desde el punto de vista de un cliente que ha pagado por un software, podrías ayudarme a expresar el valor que le puede aportar como valor al negocio del cliente?"
    
    ${customPrompt ? `Adicionalmente ten esto en cuenta: ${customPrompt}` : ''}
    `;

    const openaiResponse = await openai.createChatCompletion({
        model,
        messages: [{ role: "user", content: prompt }]
    });
    return openaiResponse.data.choices[0].message.content.trim();
}
async function getFriendlyReport({ issues, customPrompt = '', model = 'gpt-4' }) {
    const sheetPrompt = await SheetService.getReportPrompt();
    const prompt = replaceTemplateVars(sheetPrompt, {issues, customPrompt});

    const openaiResponse = await openai.createChatCompletion({
        model,
        messages: [{ role: "user", content: prompt }]
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
