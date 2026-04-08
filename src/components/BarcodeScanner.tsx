import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import styles from './BarcodeScanner.module.css';

interface BarcodeScannerProps {
  /** Função disparada ao ler um código de barras com sucesso */
  onScan: (barcode: string) => void;
  /** Controla se a câmera está ligada ou desligada */
  isActive: boolean;
  /** Função para fechar o scanner manualmente via UI */
  onClose?: () => void;
}

export const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ 
  onScan, 
  isActive, 
  onClose 
}) => {
  const regionId = "html5qr-code-full-region";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const[errorStatus, setErrorStatus] = useState<string | null>(null);

  // Função isolada e segura para matar a instância da câmera sem dar "Crash" no React
  const stopAndClearCamera = async () => {
    if (!scannerRef.current) return;

    try {
      // O Html5Qrcode tem estados internos: 1 = Not Started, 2 = Scanning, 3 = Paused.
      // O erro "already under transition" acontece se tentarmos parar quando não está no estado 2.
      const state = scannerRef.current.getState();
      
      if (state === 2) {
        await scannerRef.current.stop();
      }
    } catch (error) {
      // O catch engole silenciosamente o erro de transição da biblioteca
      console.warn("Aviso ao parar câmera (ignorado com sucesso):", error);
    } finally {
      try {
        scannerRef.current.clear();
      } catch (e) {
        // Ignora erros ao limpar o DOM
      }
      scannerRef.current = null;
    }
  };

  useEffect(() => {
    // Se o modal for fechado (isActive falso), aciona a nossa parada segura
    if (!isActive) {
      stopAndClearCamera();
      return;
    }

    const startScanner = async () => {
      try {
        setErrorStatus(null);
        
        // Inicializa o motor com amplo suporte gráfico (EAN, UPC, Code128, ITF, Codabar, etc)
        const html5QrCode = new Html5Qrcode(regionId, {
          verbose: false,
          formatsToSupport:[
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.CODABAR,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE
          ]
        });
        
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: "environment" }, // Força o uso da câmera traseira do celular
          {
            fps: 10, // 10 Frames por segundo: Balanço ideal entre performance e bateria
            qrbox: { width: 250, height: 150 }, // Desenha a mira na proporção correta para código de barras
            aspectRatio: 1.0 // Mantém a proporção do vídeo sem distorcer
          },
          (decodedText: string) => {
            // Código lido com sucesso, devolvemos para a tela de Venda
            onScan(decodedText);
          },
          (_errorMessage: string) => {
            // Erros contínuos de "código não encontrado" a cada frame são normais. 
            // Ignoramos silenciosamente para não inundar o console.
          }
        );
      } catch (err: unknown) {
        console.error("Erro ao iniciar a câmera: ", err);
        setErrorStatus("Não foi possível acessar a câmera. Verifique as permissões do seu navegador.");
      }
    };

    // Usamos um pequeno timeout para garantir que o React já renderizou a <div id={regionId}> no DOM real
    const timer = setTimeout(() => {
      startScanner();
    }, 100);

    // Função de limpeza de ciclo de vida do componente React
    return () => {
      clearTimeout(timer);
      stopAndClearCamera();
    };
  }, [isActive, onScan]);

  // Não renderiza nada no DOM se não estiver ativo
  if (!isActive) return null;

  return (
    <div className={styles.scannerOverlay}>
      <div className={styles.scannerContainer}>
        <div className={styles.scannerHeader}>
          <h3>Leitor de Código de Barras</h3>
          {onClose && (
            <button className={styles.closeButton} onClick={onClose}>
              X
            </button>
          )}
        </div>
        
        {errorStatus ? (
          <div className={styles.errorMessage}>
            {errorStatus}
          </div>
        ) : (
          <div id={regionId} className={styles.cameraRegion} />
        )}
        
        <p className={styles.instructionText}>
          Aponte a câmera traseira para o código do produto
        </p>
      </div>
    </div>
  );
};