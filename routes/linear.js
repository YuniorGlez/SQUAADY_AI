const { millisecondsToStr, openai, linearClient } = require('./../helpers');

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
        const comment = data.body;
        const issueId = data.issue.id;
        const issue = await linearClient.issue(issueId);
        if (comment && comment.startsWith('/description')) {
            console.log('Entro al if');
            // Generate a client-friendly description and add it as a comment
            const friendlyDescription = await getFriendlyDescription(issue);
            await addCommentToTask(issue.id, friendlyDescription);
        } else if (comment && comment.startsWith('/code')) {
            // Here you would handle generating code based on the issue's description or some other functionality
        } else if (comment && comment.startsWith('/report')) {
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

async function getFriendlyDescription(issue) {
    const prompt = `"Hola, soy un product manager que necesita proporcionar una actualización a nuestro cliente. Hemos completado la tarea '${issue.title} - ${issue.description}'. Necesito presentar esta tarea desde tres diferentes perspectivas: como una solución a un problema, cómo afectará al usuario final y qué valor aporta al negocio. 

    Por favor, ayúdame a reformular esta tarea en términos sencillos y no técnicos que sean fáciles de entender para el cliente. Recuerda, cada descripción debe ser concisa, con un máximo de 250 caracteres.
    
    Por último, quiero que cada respuesta esté lista para ser copiada, pegada y enviada a un cliente directamente. Por lo tanto, asegúrate de que cada bloque de respuesta sea un mensaje completo y coherente.
    
    Bloque 1 - ### solución: 
    
    Podrías ayudarme a reformular esto en términos sencillos que describan el problema que estábamos resolviendo y cómo esta tarea proporciona una solución? 
    
    Bloque 2 - ### usuario: 
    
    Podrías ayudarme a explicar cómo esta tarea impactará positivamente al usuario final en una sola oración?
    
    Bloque 3 - ### negocio:
    
    Podrías ayudarme a expresar este valor de una manera que sea fácilmente comprensible para el cliente, en términos de cómo aporta valor al negocio del cliente?"
    `;

    const openaiResponse = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
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
