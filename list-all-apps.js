
const apiKey = 'f33ddb9d5f1f48958df69577f6cdaa8d';

async function listApps() {
    console.log('Listing Apps...');
    const url = 'https://www.runninghub.cn/openapi/v2/app/list';
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                page: 1,
                pageSize: 50
            })
        });
        const data = await response.json();
        if (data.items) {
            data.items.forEach(app => {
                console.log(`- [${app.appId}] ${app.appName} (${app.appType})`);
            });
        } else {
            console.log('No apps found or error:', data);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

listApps();
