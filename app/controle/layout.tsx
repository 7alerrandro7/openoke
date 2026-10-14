import { Suspense, type ReactNode } from "react";

export default function ControleLayout({ children }: { children: ReactNode }) {
	return <Suspense>{children}</Suspense>;
}
