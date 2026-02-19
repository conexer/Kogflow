
const apiKey = 'f33ddb9d5f1f48958df69577f6cdaa8d';
const workflowId = '2024406698282196993'; // The one user wants

async function test() {
    console.log(`Testing Workflow: ${workflowId}`);
    const res = await fetch(`https://www.runninghub.cn/openapi/v2/run/ai-app/${workflowId}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            nodeInfoList: [
                { nodeId: "39", fieldName: "image", fieldValue: "https://vmuvjfflszhifuyvmjwh.supabase.co/storage/v1/object/public/uploads/1739784343118_v009h.jpg" }
            ]
        })
    });
    const data = await res.json();
    console.log('Result:', JSON.stringify(data, null, 2));
}
test();
