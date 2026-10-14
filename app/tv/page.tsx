"use client";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react"; // Biblioteca para gerar o QR Code na tela
import type { MediaConnection, Peer } from "peerjs";

type Microfone = {
  chamada: MediaConnection;
  stream: MediaStream;
};

function AudioMicrofone({ stream, numero }: { stream: MediaStream; numero: number }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    console.log("AUDIO:: ", audio);
    if (!audio) return;
    audio.srcObject = stream;
    void audio.play().catch(() => {});

    return () => {
      audio.pause();
      audio.srcObject = null;
    };
  }, [stream]);

  return <audio ref={audioRef} controls autoPlay className="max-w-full" aria-label={`Áudio do microfone ${numero}`} />;
}

export default function TvPlayer() {
  const [peerId, setPeerId] = useState<string>("");
  const [erro, setErro] = useState("");
  const [logControle, setLogControle] = useState<string>("Estado inicial");
  const [microfones, setMicrofones] = useState<Microfone[]>([]);
  const divRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelado = false;
    let peerAtual: Peer | null = null;
    const chamadas = new Set<MediaConnection>();
    const encerrarChamada = (chamada: MediaConnection) => {
      if (!chamadas.delete(chamada)) return;
      chamada.removeAllListeners();
      chamada.close();
      if (!cancelado) {
        setMicrofones((atuais) => atuais.filter((microfone) => microfone.chamada !== chamada));
      }
    };

    // Importa dinamicamente para rodar apenas no navegador (Serverless)
    import("peerjs")
      .then(({ Peer }) => {

        setLogControle(`Iniciando PeerJS...`);
        if (cancelado) return;
        const peer = new Peer(); // Conecta automaticamente ao servidor gratuito do PeerJS
        peerAtual = peer;

        peer.on("open", (id) => {
          if (cancelado) return;
          setPeerId(id); // ID único gerado para esta TV
          setLogControle(`PeerJS conectado com ID: ${id}`);
        });

        peer.on("call", (chamada) => {
          if (cancelado) {
            chamada.close();
            return;
          }
          chamadas.add(chamada);
          setErro("");
          chamada.on("stream", (stream) => {
            if (cancelado || !chamadas.has(chamada)) return;
            setMicrofones((atuais) => [...atuais.filter((microfone) => microfone.chamada !== chamada), { chamada, stream }]);
          });
          chamada.on("close", () => {
            encerrarChamada(chamada);
          });
          chamada.on("error", () => {
            if (cancelado || !chamadas.has(chamada)) return;
            encerrarChamada(chamada);
            setErro("Não foi possível receber o áudio do microfone.");
          });
          chamada.answer();
        });
        peer.on("error", () => {
          if (cancelado) return;
          chamadas.forEach(encerrarChamada);
          setErro("Erro na conexão PeerJS.");
        });

        // Escuta quando o celular conecta à TV
        peer.on("connection", (conexao) => {
          console.log("Celular conectado diretamente!");

          // Escuta os comandos enviados do celular
          conexao.on("data", (data: unknown) => {
            if (cancelado) return;
            if (typeof data !== "object" || data === null || !("type" in data) || !("videoId" in data)) {
              return;
            }

            if (data.type === "ADD_SONG") {
              console.log("Vídeo do YouTube recebido via P2P:", data.videoId);
              // Lógica para colocar o vídeo na fila do Player do YouTube
            }
          });
        });
      })
      .catch(() => {
        if (!cancelado) setErro("Não foi possível iniciar o PeerJS.");
      });

    return () => {
      cancelado = true;
      chamadas.forEach(encerrarChamada);
      // peerAtual?.removeAllListeners();
      // peerAtual?.destroy();
    };
  }, []);

  useEffect(() => {
    const div = divRef.current;
    if (div) div.focus();
  }, []);

  // O link do QR Code aponta para a página de controle com o ID da TV
  const baseUrl = `https://192.168.15.14:3000`;
  const linkControle = peerId ? `${baseUrl}/controle?sala=${peerId}` : "";

  return (
    <div ref={divRef} autoFocus style={{marginTop: "200px"}} className="flex flex-col items-center justify-center h-screen bg-black text-white">
      {(
        <p className="mb-4 text-yellow-400" role="status">
          logControle: {logControle}
        </p>
      )}
      {peerId ? (
        <>
          <h1 className="text-2xl mb-4">Escaneie para conectar o controle</h1>
          <QRCodeSVG value={linkControle} size={256} />
          <span>{linkControle}</span>
          <button className="bg-red-600 p-2 mt-4 rounded" onClick={() => navigator.clipboard.writeText(linkControle)}>
            Link para sala
          </button>
        </>
      ) : (
        <>
          <span>Link Controle: {linkControle}</span>
          <span>Erro: {erro}</span>
          <p>Gerando sala segura...</p>
        </>
      )}
      <div className="mt-4 flex max-w-full flex-wrap justify-center gap-2">
        {/* {microfones.map(({ chamada, stream }, index) => (
          <AudioMicrofone key={chamada.connectionId} stream={stream} numero={index + 1} />
        ))} */}
      </div>
      {erro && (
        <p className="mt-2 text-red-400" role="alert">
          {erro}
        </p>
      )}
    </div>
  );
}
