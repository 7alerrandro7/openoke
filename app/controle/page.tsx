'use client';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { DataConnection, MediaConnection, Peer } from 'peerjs';

export default function CelularControle() {
  const searchParams = useSearchParams();
  const salaId = searchParams.get('sala'); // Pega o ID da TV da URL
  const conexaoRef = useRef<DataConnection | null>(null);
  const peerRef = useRef<Peer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chamadaRef = useRef<MediaConnection | null>(null);
  const solicitacaoRef = useRef<symbol | null>(null);
  const [conectado, setConectado] = useState(false);
  const [solicitando, setSolicitando] = useState(false);
  const [microfoneAtivo, setMicrofoneAtivo] = useState(false);
  const [erro, setErro] = useState('');

  const encerrarMicrofone = () => {
    const chamada = chamadaRef.current;
    chamadaRef.current = null;
    chamada?.removeAllListeners();
    chamada?.close();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelado = false;
    let peer: Peer | null = null;

    import('peerjs').then(({ Peer }) => {
      if (cancelado) return;
      setConectado(false);
      setSolicitando(false);
      setMicrofoneAtivo(false);
      setErro('');
      if (!salaId) return;

      const novoPeer = new Peer();
      peer = novoPeer;
      peerRef.current = novoPeer;

      const desconectar = (mensagem: string) => {
        if (cancelado || peerRef.current !== novoPeer) return;
        solicitacaoRef.current = null;
        encerrarMicrofone();
        setConectado(false);
        setSolicitando(false);
        setMicrofoneAtivo(false);
        setErro(mensagem);
      };

      novoPeer.on('error', () => desconectar('Erro na conexão PeerJS com a TV.'));
      novoPeer.on('disconnected', () => desconectar('Conexão com a TV interrompida.'));
      novoPeer.on('close', () => desconectar('Conexão com a TV encerrada.'));
      novoPeer.on('open', () => {
        if (cancelado || peerRef.current !== novoPeer) return;
        // Conecta diretamente na TV usando o ID da sala
        const conn = novoPeer.connect(salaId);
        conexaoRef.current = conn;

        conn.on('open', () => {
          if (cancelado || conexaoRef.current !== conn) return;
          setConectado(true);
          setErro('');
          console.log('Conectado com sucesso na TV!');
        });
        conn.on('close', () => {
          if (conexaoRef.current === conn) desconectar('Conexão com a TV encerrada.');
        });
        conn.on('error', () => {
          if (conexaoRef.current === conn) desconectar('Não foi possível conectar à TV.');
        });
      });
    }).catch(() => {
      if (!cancelado) setErro('Não foi possível iniciar o PeerJS.');
    });

    return () => {
      cancelado = true;
      solicitacaoRef.current = null;
      encerrarMicrofone();
      conexaoRef.current?.removeAllListeners();
      conexaoRef.current?.close();
      conexaoRef.current = null;
      peerRef.current = null;
      peer?.removeAllListeners();
      peer?.destroy();
    };
  }, [salaId]);

  const ativarMicrofone = async () => {
    if (solicitacaoRef.current || streamRef.current) return;
    const peer = peerRef.current;
    const conn = conexaoRef.current;
    if (!salaId || !peer || peer.destroyed || peer.disconnected || !conn?.open || conn.peer !== salaId) {
      setErro('Conecte-se à TV antes de ativar o microfone.');
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setErro('Microfone indisponível. Use HTTPS ou localhost em um navegador compatível.');
      return;
    }

    const solicitacao = Symbol();
    solicitacaoRef.current = solicitacao;
    setSolicitando(true);
    setErro('');
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      if (
        solicitacaoRef.current !== solicitacao || peerRef.current !== peer ||
        conexaoRef.current !== conn || !conn.open || conn.peer !== salaId ||
        peer.destroyed || peer.disconnected
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const chamada = peer.call(salaId, stream);
      chamadaRef.current = chamada;
      const finalizarChamada = (mensagem: string) => {
        if (peerRef.current !== peer || chamadaRef.current !== chamada) return;
        encerrarMicrofone();
        setMicrofoneAtivo(false);
        setErro(mensagem);
      };
      chamada.on('close', () => finalizarChamada('Chamada de áudio encerrada.'));
      chamada.on('error', () => finalizarChamada('Não foi possível transmitir o áudio à TV.'));
      setMicrofoneAtivo(true);
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      if (solicitacaoRef.current !== solicitacao || peerRef.current !== peer) return;
      encerrarMicrofone();
      setMicrofoneAtivo(false);
      setErro(error instanceof Error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError')
        ? 'Permissão do microfone negada. Autorize o acesso no navegador.'
        : 'Não foi possível acessar o microfone ou iniciar a chamada com a TV.');
    } finally {
      if (solicitacaoRef.current === solicitacao) {
        solicitacaoRef.current = null;
        setSolicitando(false);
      }
    }
  };

  const desligarMicrofone = () => {
    encerrarMicrofone();
    setMicrofoneAtivo(false);
    setErro('');
  };

  // Função para enviar uma música quando o usuário clicar no celular
  const enviarMusicaParaTV = (idDoVideoDoYoutube: string) => {
    if (conexaoRef.current?.open && conexaoRef.current.peer === salaId) {
      conexaoRef.current.send({
        type: 'ADD_SONG',
        videoId: idDoVideoDoYoutube,
      });
    }
  };

  return (
    <div className="p-4 bg-gray-900 h-screen text-white">
      <h1>Controle Remoto do Karaokê</h1>
      <button 
        onClick={() => enviarMusicaParaTV('dQw4w9WgXcQ')} 
        className="bg-blue-600 p-2 mt-4 rounded"
      >
        Tocar Música de Teste
      </button>
      <button
        onClick={microfoneAtivo ? desligarMicrofone : ativarMicrofone}
        disabled={solicitando || (!microfoneAtivo && !conectado)}
        className="bg-green-600 p-2 mt-4 ml-2 rounded disabled:opacity-50"
      >
        {solicitando ? 'Solicitando microfone...' : microfoneAtivo ? 'Desligar microfone' : 'Ativar microfone'}
      </button>
      <p className="mt-4" role="status">
        {microfoneAtivo ? 'Microfone ativo' : conectado ? 'Conectado à TV' : 'Aguardando conexão com a TV'}
      </p>
      {erro && <p className="mt-2 text-red-400" role="alert">{erro}</p>}
    </div>
  );
}