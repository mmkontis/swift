import { NextRequest, NextResponse } from "next/server";

async function generateSpeech(inputText: string): Promise<ArrayBuffer | null> {
  const apiKey = process.env.ELEVEN_LABS_API_KEY;
  const voiceId = "21m00Tcm4TlvDq8ikWAM";
  const modelId = "eleven_monolingual_v1";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?optimize_streaming_latency=0`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'xi-api-key': apiKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: inputText,
        model_id: modelId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Eleven Labs API error: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  } catch (error) {
    console.error("Eleven Labs API error:", error);
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const audioData = await generateSpeech("Test me now");

    if (!audioData) {
      return NextResponse.json({ error: "Voice synthesis failed" }, { status: 500 });
    }

    return new NextResponse(audioData, {
      headers: {
        "Content-Type": "audio/mpeg",
      },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: "An unexpected error occurred" }, { status: 500 });
  }
}