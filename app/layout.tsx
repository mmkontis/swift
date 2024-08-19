import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import clsx from "clsx";
import "./globals.css";
import { Toaster } from "sonner";
import { Analytics } from "@vercel/analytics/react";
import { ThemeProvider } from "next-themes";

export const metadata: Metadata = {
	title: "Swift",
	description:
		"A fast, open-source voice assistant powered by OpenAI, Eleven Labs, and Vercel.",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className={clsx(
					GeistSans.variable,
					GeistMono.variable,
					"py-8 px-6 lg:p-10 dark:ext-black text-white dark:bg-white bg-black min-h-dvh flex flex-col justify-between antialiased font-sans select-none"
				)}
			>
				<ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
					<main className="flex flex-col items-center justify-center grow">
						{children}
					</main>

					<Toaster richColors />
					<Analytics />
				</ThemeProvider>
			</body>
		</html>
	);
}
