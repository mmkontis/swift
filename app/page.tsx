"use client";

import clsx from "clsx";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { EnterIcon, LoadingIcon } from "@/lib/icons";
import { usePlayer } from "@/lib/usePlayer";
import { track } from "@vercel/analytics";
import { useMicVAD, utils } from "@ricky0123/vad-react";
import { useTheme } from "next-themes";
import { SunIcon, MoonIcon, LanguageIcon } from "@heroicons/react/24/solid";
import { Mic, MicOff } from "react-feather";

type Message = {
	role: "user" | "assistant";
	content: string;
	latencies?: {
		transcription: number;
		textCompletion: number;
		speechSynthesis: number;
		total: number;
	};
};

export default function Home() {
	const [input, setInput] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const player = usePlayer();
	const { theme, setTheme } = useTheme();
	const [language, setLanguage] = useState("en");
	const [isMuted, setIsMuted] = useState(false);
	const [streamedText, setStreamedText] = useState("");

	const vad = useMicVAD({
		startOnLoad: true,
		onSpeechEnd: (audio) => {
			if (!isMuted) {
				player.stop();
				const wav = utils.encodeWAV(audio);
				const blob = new Blob([wav], { type: "audio/wav" });
				submit(blob);
				const isFirefox = navigator.userAgent.includes("Firefox");
				if (isFirefox) vad.pause();
			}
		},
		workletURL: "/vad.worklet.bundle.min.js",
		modelURL: "/silero_vad.onnx",
		positiveSpeechThreshold: 0.6,
		minSpeechFrames: 4,
		ortConfig(ort) {
			const isSafari = /^((?!chrome|android).)*safari/i.test(
				navigator.userAgent
			);

			ort.env.wasm = {
				wasmPaths: {
					"ort-wasm-simd-threaded.wasm":
						"/ort-wasm-simd-threaded.wasm",
					"ort-wasm-simd.wasm": "/ort-wasm-simd.wasm",
					"ort-wasm.wasm": "/ort-wasm.wasm",
					"ort-wasm-threaded.wasm": "/ort-wasm-threaded.wasm",
				},
				numThreads: isSafari ? 1 : 4,
			};
		},
	});

	useEffect(() => {
		function keyDown(e: KeyboardEvent) {
			if (e.key === "Enter") return inputRef.current?.focus();
			if (e.key === "Escape") return setInput("");
		}

		window.addEventListener("keydown", keyDown);
		return () => window.removeEventListener("keydown", keyDown);
	});

	const [messages, submit, isPending] = useActionState<
		Array<Message>,
		string | Blob
	>(async (prevMessages, data) => {
		const formData = new FormData();

		if (typeof data === "string") {
			formData.append("input", data);
			track("Text input");
		} else {
			formData.append("input", data, "audio.wav");
			track("Speech input");
		}

		for (const message of prevMessages) {
			formData.append("message", JSON.stringify(message));
		}

		formData.append("language", language);

		const startTime = Date.now();

		const response = await fetch("/api", {
			method: "POST",
			body: formData,
		});

		const transcript = decodeURIComponent(
			response.headers.get("X-Transcript") || ""
		);
		const text = decodeURIComponent(
			response.headers.get("X-Response") || ""
		);
		const latencies = JSON.parse(decodeURIComponent(
			response.headers.get("X-Latencies") || "{}"
		));

		if (!response.ok || !transcript || !text || !response.body) {
			if (response.status === 429) {
				toast.error("Too many requests. Please try again later.");
			} else {
				toast.error((await response.text()) || "An error occurred.");
			}

			return prevMessages;
		}

		const audioBlob = await response.blob();
		const audioUrl = URL.createObjectURL(audioBlob);
		const audio = new Audio(audioUrl);

		// Simulate streaming effect
		setStreamedText("");
		let currentIndex = 0;
		const streamInterval = setInterval(() => {
			if (currentIndex <= text.length) {
				setStreamedText(text.slice(0, currentIndex));
				currentIndex++;
			} else {
				clearInterval(streamInterval);
			}
		}, 50); // Adjust this value to change the streaming speed (higher value = slower)

		audio.play();

		const endTime = Date.now();
		const totalLatency = endTime - startTime;

		setInput(transcript);

		return [
			...prevMessages,
			{
				role: "user",
				content: transcript,
			},
			{
				role: "assistant",
				content: text,
				latencies: {
					...latencies,
					total: totalLatency,
				},
			},
		];
	}, []);

	function handleFormSubmit(e: React.FormEvent) {
		e.preventDefault();
		submit(input);
	}

	function toggleMute() {
		setIsMuted(!isMuted);
		if (!isMuted) {
			vad.pause();
		} else {
			vad.start();
		}
	}

	return (
		<>
			<div className="absolute top-4 right-4 flex space-x-2">
				<button
					onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
					className="p-2 rounded-full dark:bg-gray-800 bg-gray-200"
				>
					{theme === "light" ? (
						<MoonIcon className="w-6 h-6" />
					) : (
						<SunIcon className="w-6 h-6" />
					)}
				</button>
				<button
					onClick={() => setLanguage(language === "en" ? "el" : "en")}
					className="p-2 rounded-full dark:bg-gray-800 bg-gray-200"
				>
					<LanguageIcon className="w-6 h-6" />
					<span className="ml-1">{language.toUpperCase()}</span>
				</button>
			</div>

			<div className="flex flex-col items-center justify-center min-h-screen px-4">
				<div className="w-full max-w-4xl mb-8">
					<h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-center mb-4 dark:text-white">
						{streamedText || "Ask me anything"}
					</h1>
				</div>

				<form
					className="rounded-full dark:bg-neutral-800/80 bg-neutral-200/80 flex items-center w-full max-w-3xl border border-transparent dark:hover:border-neutral-700 dark:focus-within:border-neutral-600 dark:hover:focus-within:border-neutral-600 hover:border-neutral-300 focus-within:border-neutral-400 hover:focus-within:border-neutral-400"
					onSubmit={handleFormSubmit}
				>
					<input
						type="text"
						className="bg-transparent focus:outline-none p-4 w-full dark:placeholder:text-neutral-400 placeholder:text-neutral-600"
						required
						placeholder="Type your question here"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						ref={inputRef}
					/>

					<button
						type="button"
						onClick={toggleMute}
						className={`p-4 rounded-full ${isMuted ? "text-red-500" : "dark:text-neutral-300 text-neutral-700"
							} dark:hover:bg-neutral-700 hover:bg-neutral-300`}
					>
						{isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
					</button>

					<button
						type="submit"
						className="p-4 dark:text-neutral-300 dark:hover:text-white text-neutral-700 hover:text-black"
						disabled={isPending}
						aria-label="Submit"
					>
						{isPending ? <LoadingIcon /> : <EnterIcon />}
					</button>
				</form>

				{messages.length > 0 && messages.at(-1)?.latencies && (
					<div className="text-xs font-mono dark:text-neutral-300 text-neutral-700 mt-4">
						<p>Transcription: {messages.at(-1)?.latencies?.transcription}ms</p>
						<p>Text Completion: {messages.at(-1)?.latencies?.textCompletion}ms</p>
						<p>Speech Synthesis: {messages.at(-1)?.latencies?.speechSynthesis}ms</p>
						<p>Total Latency: {messages.at(-1)?.latencies?.total}ms</p>
					</div>
				)}

				{messages.length === 0 && (
					<div className="text-center mt-8 dark:text-neutral-400 text-neutral-600">
						<p>
							A fast, open-source voice assistant powered by{" "}
							<A href="https://openai.com">OpenAI</A>,{" "}
							<A href="https://elevenlabs.io">Eleven Labs</A>,{" "}
							<A href="https://www.vad.ricky0123.com/">VAD</A>,
							and <A href="https://vercel.com">Vercel</A>.{" "}
							<A
								href="https://github.com/ai-ng/swift"
								target="_blank"
							>
								Learn more
							</A>
							.
						</p>

						{vad.loading ? (
							<p>Loading speech detection...</p>
						) : vad.errored ? (
							<p>Failed to load speech detection.</p>
						) : (
							<p>Start talking to chat.</p>
						)}
					</div>
				)}
			</div>

			<div
				className={clsx(
					"absolute size-36 blur-3xl rounded-full bg-gradient-to-b dark:from-red-600 dark:to-red-800 from-red-200 to-red-400 -z-50 transition ease-in-out",
					{
						"opacity-0": vad.loading || vad.errored || isMuted,
						"opacity-30":
							!vad.loading && !vad.errored && !vad.userSpeaking && !isMuted,
						"opacity-100 scale-110": vad.userSpeaking && !isMuted,
					}
				)}
			/>
		</>
	);
}

function A(props: any) {
	return (
		<a
			{...props}
			className="dark:text-neutral-500 text-neutral-500 hover:underline font-medium"
		/>
	);
}
