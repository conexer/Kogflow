'use server';

import { createClient } from '@supabase/supabase-js';

// --- Constants ---
// App IDs for WAN 2.2 Image to Video
const WAN22_APP_ID = '2034018763611316225';
const SECONDARY_WAN22_APP_ID = '2034388379109957633';
// runninghub.ai is currently the stable domain for our WAN 2.2 App ID
const RUNNINGHUB_BASE = 'https://www.runninghub.ai';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const runningHubApiKey = process.env.RUNNINGHUB_API_KEY;

interface VideoGenerationRequest {
    imageUrls: string[];
    title: string;
    realtorInfo: {
        name: string;
        phone: string;
        email: string;
    };
    userId?: string;
    projectId?: string;
    aspectRatio?: '16:9' | '9:16';
}

// Map aspect ratio string to WAN 2.2 node 260 select index
// Values per official API docs: 1=Auto, 2=1:1, 3=4:3, 4=3:4, 5=16:9, 6=9:16
function aspectRatioToIndex(ratio: '16:9' | '9:16' | undefined): string {
    switch (ratio) {
        case '16:9': return '5';
        case '9:16': return '6';
        default: return '1'; // Auto match
    }
}

export async function generateVideo(data: VideoGenerationRequest) {
    console.log('🚀 generateVideo() called with:', data);

    if (!runningHubApiKey) {
        console.error('❌ Missing RunningHub API key!');
        return { error: 'RunningHub API key not configured' };
    }

    // Set to true to use mock api, false for real api
    const MOCK_MODE = false;

    if (MOCK_MODE) {
        console.log('🎬 Mock Video Generation:', {
            images: data.imageUrls.length,
            title: data.title,
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
        const taskIds = data.imageUrls.map((_, i) => `mock-video-${Date.now()}-${i}`);
        return {
            success: true,
            taskIds,
            results: data.imageUrls.map((url, i) => ({
                imageUrl: url,
                taskId: taskIds[i],
                error: null
            })),
            isMock: true
        };
    }

    try {
        console.log('🎬 Starting WAN 2.2 Image-to-Video batch on RunningHub.ai...');
        const taskIds: string[] = [];
        const errors: any[] = [];
        const results: { imageUrl: string; taskId: string | null; error: string | null }[] = [];

        const ratioIndex = aspectRatioToIndex(data.aspectRatio);
        const prompt = 'Have the camera slowly glide straight into the room.';

        for (let i = 0; i < data.imageUrls.length; i++) {
            const imageUrl = data.imageUrls[i];
            console.log(`Processing image ${i + 1}/${data.imageUrls.length}: ${imageUrl}`);

            // Delay between requests to avoid rate limiting
            if (i > 0) {
                console.log('⏳ Waiting 2 seconds before next request...');
                await new Promise(resolve => setTimeout(resolve, 2000));
            }

            const appIds = [WAN22_APP_ID, SECONDARY_WAN22_APP_ID];
            let imageSuccess = false;

            for (let j = 0; j < appIds.length; j++) {
                const currentAppId = appIds[j];
                const isRetry = j > 0;
                
                if (isRetry) {
                    console.log(`🔄 Retrying with secondary App ID: ${currentAppId}`);
                }

                const payload = {
                    nodeInfoList: [
                        { nodeId: '135', fieldName: 'image', fieldValue: imageUrl, description: 'Upload image' },
                        { nodeId: '260', fieldName: 'select', fieldValue: ratioIndex, description: 'Aspect ratio' },
                        { nodeId: '139', fieldName: 'index', fieldValue: '1', description: 'Prompt input method' },
                        { nodeId: '116', fieldName: 'text', fieldValue: prompt, description: 'Creative description' }
                    ],
                    instanceType: 'default',
                    usePersonalQueue: 'false'
                };

                const response = await fetch(`${RUNNINGHUB_BASE}/openapi/v2/run/ai-app/${currentAppId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${runningHubApiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(payload)
                });

                let result: any;
                try {
                    result = await response.json();
                } catch {
                    const text = await response.text();
                    console.error(`❌ Non-JSON response for image ${imageUrl} (App ${currentAppId}):`, text);
                    if (!isRetry) continue; // Try fallback
                    results.push({ imageUrl, taskId: null, error: `Parse error: ${text.slice(0, 200)}` });
                    errors.push({ imageUrl, error: 'Non-JSON response' });
                    break;
                }

                console.log(`📦 WAN 2.2 response (image ${i + 1}, App ${j === 0 ? 'Primary' : 'Secondary'}):`, result);

                if (!response.ok || (result.errorCode && result.errorCode !== '0')) {
                    const errorMsg = result.errorMessage || result.message || 'Unknown API error';
                    console.error(`❌ Error ${result.errorCode || response.status} for image ${imageUrl} (App ${currentAppId}):`, errorMsg);
                    
                    if (!isRetry) {
                        console.log('⚠️ Primary App failed, attempting fallback...');
                        continue; // Try secondary App
                    }

                    results.push({ imageUrl, taskId: result.taskId || null, error: errorMsg });
                    errors.push({ imageUrl, error: errorMsg });
                    break;
                }

                if (result.taskId) {
                    results.push({ imageUrl, taskId: result.taskId, error: null });
                    taskIds.push(result.taskId);
                    imageSuccess = true;
                    break; // Success!
                } else {
                    if (!isRetry) continue;
                    results.push({ imageUrl, taskId: null, error: 'No taskId returned' });
                    errors.push({ imageUrl, error: 'No taskId returned' });
                    break;
                }
            }
        }

        return {
            success: errors.length === 0,
            taskIds,
            results,
            errorCount: errors.length,
            message: errors.length > 0 ? `Completed with ${errors.length} errors.` : 'Batch started successfully'
        };

    } catch (error: any) {
        console.error('❌ Batch Generation Exception:', error);
        return { error: error.message || 'Failed to start generation batch' };
    }
}

export async function checkVideoStatus(taskId: string) {
    if (!runningHubApiKey) {
        return { error: 'API key not configured' };
    }

    // Mock status
    if (taskId.startsWith('mock-video-')) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        return {
            status: 'success',
            videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            message: 'Mock video ready'
        };
    }

    try {
        // WAN 2.2 polling: POST /openapi/v2/query on runninghub.cn
        const response = await fetch(`${RUNNINGHUB_BASE}/openapi/v2/query`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${runningHubApiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ taskId })
        });

        if (!response.ok) {
            throw new Error(`Status check failed: ${response.status}`);
        }

        const result = await response.json();
        console.log(`📡 Status check for ${taskId}:`, result);
        return parseStatusResult(result);

    } catch (error: any) {
        console.error('Check status error:', error);
        return { error: error.message };
    }
}

function parseStatusResult(result: any) {
    const status = result.status;
    const errorCode = result.errorCode;

    if (status === 'SUCCESS' && result.results && result.results.length > 0) {
        const results = result.results;
        // WAN 2.2 returns results with fieldName='video_url' and the file at fileUrl
        const videoResult = results.find((r: any) => r.fieldName === 'video_url') || results[0];
        const videoUrl = videoResult?.fileUrl || videoResult?.url;

        return {
            status: 'success',
            videoUrl,
            message: 'Video generated'
        };
    }

    if (status === 'FAILED' || (errorCode && errorCode !== '0')) {
        return {
            status: 'failed',
            error: result.errorMessage || result.failedReason?.exception_message || 'Generation failed',
            errorCode: errorCode
        };
    }

    return {
        status: 'processing',
        message: 'Video still generating...'
    };
}

export async function saveVideoToProject(data: {
    userId: string;
    projectId: string;
    videoUrl: string;
    title: string;
    imageCount: number;
}) {
    if (!supabaseUrl || !supabaseKey) {
        return { error: 'Database not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        const { data: video, error } = await supabase
            .from('videos')
            .insert({
                user_id: data.userId,
                project_id: data.projectId,
                video_url: data.videoUrl,
                title: data.title,
                image_count: data.imageCount
            })
            .select()
            .single();

        if (error) throw error;
        return { success: true, video };
    } catch (error: any) {
        console.error('Error saving video to project:', error);
        return { error: error.message };
    }
}

export async function deleteVideo(videoId: number, videoUrl: string) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    try {
        const { error: dbError } = await supabase
            .from('videos')
            .delete()
            .eq('id', videoId);
        if (dbError) throw dbError;

        const path = videoUrl.split('/public/videos/')[1];
        if (path) {
            const { error: storageError } = await supabase.storage
                .from('videos')
                .remove([path]);
            if (storageError) console.error('Storage removal error:', storageError);
        }
        return { success: true };
    } catch (error: any) {
        console.error('Error deleting video:', error);
        return { error: error.message };
    }
}
