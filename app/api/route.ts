import { OpenAI } from "openai";
import { headers } from "next/headers";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { NextRequest, NextResponse } from "next/server";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const schema = zfd.formData({
	input: z.union([zfd.text(), zfd.file()]),
	message: zfd.repeatableOfType(
		zfd.json(
			z.object({
				role: z.enum(["user", "assistant"]),
				content: z.string(),
			})
		)
	),
	language: z.enum(["en", "el"]),
});

export async function POST(request: NextRequest) {
	const requestId = request.headers.get("x-vercel-id") || Date.now().toString();
	const latencies: { transcription: number; textCompletion: number; speechSynthesis: number } = {
		transcription: 0,
		textCompletion: 0,
		speechSynthesis: 0,
	};

	try {
		const transcriptionStart = Date.now();
		console.time(`transcribe-${requestId}`);

		const { data, success } = schema.safeParse(await request.formData());
		if (!success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

		const transcript = await getTranscript(data.input, data.language);
		if (!transcript) return NextResponse.json({ error: "Invalid audio" }, { status: 400 });

		console.timeEnd(`transcribe-${requestId}`);
		latencies.transcription = Date.now() - transcriptionStart;

		const textCompletionStart = Date.now();
		console.time(`text-completion-${requestId}`);

		const completion = await openai.chat.completions.create({
			model: "gpt-4o-mini",
			messages: [
				{
					role: "system",
					content: `- You are Swift, a friendly and helpful voice assistant.
				- Respond briefly to the user's request, and do not provide unnecessary information.
				- If you don't understand the user's request, ask for clarification.
				- You do not have access to up-to-date information, so you should not provide real-time data.
				- You are not capable of performing actions other than responding to the user.
				- Do not use markdown, emojis, or other formatting in your responses. Respond in a way easily spoken by text-to-speech software.
				- User location is ${location()}.
				- The current time is ${time()}.
				- Your large language model is GPT-4, created by OpenAI.
				- Your text-to-speech is powered by Eleven Labs.
				- You are built with Next.js and hosted on Vercel.
				- Respond in ${data.language === "en" ? "English" : "Greek"}.`,
				},
				...data.message,
				{
					role: "user",
					content: transcript,
				},
			],
		});

		const response = completion.choices[0].message.content;
		if (!response) {
			throw new Error("No response generated from OpenAI");
		}

		console.timeEnd(`text-completion-${requestId}`);
		latencies.textCompletion = Date.now() - textCompletionStart;

		const speechSynthesisStart = Date.now();
		console.time(`eleven-labs-request-${requestId}`);

		const audioData = await generateSpeech(response, data.language);

		console.timeEnd(`eleven-labs-request-${requestId}`);
		latencies.speechSynthesis = Date.now() - speechSynthesisStart;

		if (!audioData) {
			console.error("Eleven Labs API Error: No audio data generated");
			return NextResponse.json({ error: "Voice synthesis failed" }, { status: 500 });
		}

		console.time(`stream-${requestId}`);

		const audioResponse = new NextResponse(audioData, {
			headers: {
				"Content-Type": "audio/mpeg",
				"X-Transcript": encodeURIComponent(transcript),
				"X-Response": encodeURIComponent(response),
				"X-Latencies": encodeURIComponent(JSON.stringify(latencies)),
			},
		});

		console.timeEnd(`stream-${requestId}`);

		return audioResponse;
	} catch (error) {
		console.error("Unexpected error:", error);
		return NextResponse.json({ error: "An unexpected error occurred", details: error.message }, { status: 500 });
	}
}

function location() {
	const headersList = headers();

	const country = headersList.get("x-vercel-ip-country");
	const region = headersList.get("x-vercel-ip-country-region");
	const city = headersList.get("x-vercel-ip-city");

	if (!country || !region || !city) return "unknown";

	return `${city}, ${region}, ${country}`;
}

function time() {
	return new Date().toLocaleString("en-US", {
		timeZone: headers().get("x-vercel-ip-timezone") || undefined,
	});
}

async function getTranscript(input: string | File, language: string) {
	if (typeof input === "string") return input;

	try {
		const transcription = await openai.audio.transcriptions.create({
			file: input,
			model: "whisper-1",
			language: language === "el" ? "el" : "en",
		});

		return transcription.text.trim() || null;
	} catch (error) {
		console.error("Transcription error:", error);
		return null;
	}
}

async function generateSpeech(inputText: string, language: string): Promise<ArrayBuffer | null> {
	const apiKey = process.env.ELEVEN_LABS_API_KEY;
	const voiceId = language === "el" ? "AZnzlk1XvdvUeBnXmlld" : "21m00Tcm4TlvDq8ikWAM"; // Greek: Elli, English: Rachel
	const modelId = "eleven_multilingual_v2";
	const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

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
