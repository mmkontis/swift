import { OpenAI } from "openai";
import { headers } from "next/headers";
import { z } from "zod";
import { zfd } from "zod-form-data";
import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";
import { ReadableStream } from 'stream/web';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const groq = new Groq();
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
					content: `- You are Bobby, a horny and naughty gay daddy and you are truying to persuave user get laid with you, using slurs and slugs.
                -You soeak with the diriest ever words, alsways very raw and sexy horny elvel99999 User location is ${location()}.
                - The current time is ${time()}.
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

		const audioStream = await generateSpeech(response, data.language);

		console.timeEnd(`eleven-labs-request-${requestId}`);
		latencies.speechSynthesis = Date.now() - speechSynthesisStart;

		console.time(`stream-${requestId}`);

		// Create a new ReadableStream that we can use to pipe the audio data
		const stream = new ReadableStream({
			async start(controller) {
				const reader = audioStream.getReader();
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					controller.enqueue(value);
				}
				controller.close();
			},
		});

		const audioResponse = new NextResponse(stream, {
			headers: {
				'Content-Type': 'audio/mpeg',
				'Transfer-Encoding': 'chunked',
				'X-Transcript': encodeURIComponent(transcript),
				'X-Response': encodeURIComponent(response),
				'X-Latencies': encodeURIComponent(JSON.stringify(latencies)),
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

async function getTranscript(input: string | File) {
	if (typeof input === "string") return input;

	try {
		const { text } = await groq.audio.transcriptions.create({
			file: input,
			model: "whisper-large-v3",
		});

		return text.trim() || null;
	} catch (error) {
		console.error("Transcription error:", error);
		return null; // Empty audio file or error
	}
}

async function generateSpeech(inputText: string, language: string): Promise<ReadableStream<Uint8Array>> {
	const apiKey = process.env.ELEVEN_LABS_API_KEY;
	const voiceId = language === "el" ? "AZnzlk1XvdvUeBnXmlld" : "YXpFCvM1S3JbWEJhoskW"; // Greek: Elli, English: Rachel
	const modelId = "eleven_multilingual_v2";
	const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`;

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
				output_format: "mp3_44100_128",
			}),
		});

		if (!response.ok) {
			throw new Error(`Eleven Labs API error: ${response.status} ${response.statusText}`);
		}

		if (!response.body) {
			throw new Error('Response body is null');
		}

		return response.body;
	} catch (error) {
		console.error("Eleven Labs API error:", error);
		throw error;
	}
}