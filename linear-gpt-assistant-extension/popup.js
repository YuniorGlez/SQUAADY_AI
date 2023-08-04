document.getElementById('get-gpt-response').addEventListener('click', function () {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        let url = tabs[0].url;
        let urlParts = url.split("/");
        let issueId = urlParts[urlParts.length - 2];

        const language = document.getElementById('language').value;
        const additionalInfo = document.getElementById('additional-info').value;

        fetch(`http://localhost:3000/linear/gpt-response/${issueId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                language: language, 
                additionalInfo: additionalInfo
            }),
        })
        .then(response => response.json())
        .then(data => {
            document.getElementById('gpt-response').innerText = data.content;
        })
        .catch(error => console.error(error));
    });
});
