import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import "./globals.css";
import { WalletContextProvider } from "@/components/providers/WalletContextProvider";
import { FiveProvider } from "@/components/providers/FiveProvider";

export const metadata: Metadata = {
  title: "5ive Connect4 Web",
  description: "Connect4 PvP on 5IVE VM",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <WalletContextProvider>
          <FiveProvider>{children}</FiveProvider>
        </WalletContextProvider>
      </body>
    </html>
  );
}
