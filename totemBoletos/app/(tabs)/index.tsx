// ConsultaFaturas.tsx
import React, { useState, useEffect } from 'react'; // <-- MUDANÇA 1: Adicionado useEffect
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Alert,
  SafeAreaView,
  Platform,
} from 'react-native';
// import { WebView } from 'react-native-webview'; // <-- MUDANÇA 2: IMPORT REMOVIDO

const API_BASE = process.env.EXPO_PUBLIC_API_BASE || 'http://localhost:3000';

interface Fatura {
  numerofatura: string;
  vencimentofatura: string;
  valorfatura: string;
  linhadigitavel: string;
}

interface Message {
  text: string;
  type: 'ok' | 'warn' | 'err';
}

interface Pessoa {
  documento: string | null;
  nome: string | null;
  tipoPessoa: 'PF' | 'PJ';
  exige: 'dt_nasc' | 'contrato';
  contrato?: string | null;
  cod_pessoa?: string | null;
  dt_nasc?: string | null;
  carteirinha?: string | null;
}

// ====== COMPONENTE PRINCIPAL ======
const ConsultaFaturas = () => {
  // ====== ESTADO (React Hooks) ======
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [contrato, setContrato] = useState('');
  const [numeroFatura, setNumeroFatura] = useState('');
  const [emailDestino, setEmailDestino] = useState('');

  const [faturas, setFaturas] = useState<Fatura[]>([]);
  const [boletoURL, setBoletoURL] = useState<string | null>(null);
  const [numeroSelecionado, setNumeroSelecionado] = useState<string | null>(null);

  const [isLoadingFaturas, setIsLoadingFaturas] = useState(false);
  const [isLoadingBoleto, setIsLoadingBoleto] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  
  const [message, setMessage] = useState<Message | null>(null);

  // Controladores de visibilidade da UI
  const [showGerarBoleto, setShowGerarBoleto] = useState(false);
  const [showEmailInput, setShowEmailInput] = useState(false);
  const [showPdfViewer, setShowPdfViewer] = useState(false);

  // Wizard de identificação → dados → faturas → boleto
  const [step, setStep] = useState<'ident' | 'dados' | 'faturas' | 'boleto'>('ident');
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [documento, setDocumento] = useState('');
  const [cnpjPJ, setCnpjPJ] = useState('');
  const [dtNasc, setDtNasc] = useState('');

  // <-- MUDANÇA 3: State e Effect para carregar a WebView dinamicamente -->
  const [WebViewComponent, setWebViewComponent] = useState<React.ComponentType<any> | null>(null);

  useEffect(() => {
    // Se a plataforma NÃO for web, carregue o componente
    if (Platform.OS !== 'web') {
      const { WebView } = require('react-native-webview');
      setWebViewComponent(() => WebView); // Armazena o componente no state
    }
  }, []); // Executa apenas uma vez
  // <-- FIM DA MUDANÇA 3 -->

  // ====== FUNÇÕES DA API (adaptadas para TS) ======
  const buscarFaturasFront = async (cpf: string, contract: string): Promise<Fatura[]> => {
    const r = await fetch(`${API_BASE}/api/faturas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cpfCnpj: cpf, contrato: contract }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error('Falha ao buscar faturas: ' + t);
    }
    const data = await r.json();
    return Array.isArray(data?.content) ? data.content : [];
  };

  const buscarBoletoFront = async (numFatura: string): Promise<string | null> => {
    const r = await fetch(`${API_BASE}/api/boleto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numeroFatura: numFatura }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error('Falha ao gerar boleto: ' + t);
    }
    const data = await r.json();
    return data?.url || null;
  };
    
  const enviarBoletoEmailFront = async (email: string, url: string, numFatura: string) => {
    const r = await fetch(`${API_BASE}/api/send-boleto`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, url, numeroFatura: numFatura }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error('Falha ao enviar e-mail: ' + t);
    }
    return r.json().catch(() => ({}));
  };

  const validarIdentificacaoFront = async (payload: any): Promise<Pessoa> => {
    const r = await fetch(`${API_BASE}/api/identificacao/validar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error('Falha na identificação: ' + t);
    }
    return r.json();
  };

  const handleValidarIdentificacao = async () => {
    setMessage(null);
    setFaturas([]);
    setShowGerarBoleto(false);
    setBoletoURL(null);

    const doc = (documento || '').replace(/\D/g, '');
    if (!doc) {
      setMessage({ text: 'Informe CPF/CNPJ (somente números).', type: 'warn' });
      return;
    }

    setIsLoadingFaturas(true);
    try {
      const dados = await validarIdentificacaoFront({ documento: doc });
      setPessoa(dados);
      setContrato(dados?.contrato ?? '');
      setCnpjPJ('');
      setDtNasc('');
      setStep('dados');
      setMessage({ text: 'Identificação validada. Preencha os dados complementares.', type: 'ok' });
    } catch (e: any) {
      setMessage({ text: e.message || 'Erro ao validar identificação.', type: 'err' });
    } finally {
      setIsLoadingFaturas(false);
    }
  };

  const handleBuscarFaturas = async () => {
    setMessage(null);
    setFaturas([]);
    setShowGerarBoleto(false);
    setBoletoURL(null);

    const p = pessoa;
    if (!p) {
      setMessage({ text: 'Valide o documento primeiro.', type: 'warn' });
      setStep('ident');
      return;
    }

    const contract = (contrato || '').replace(/\D/g, '');
    let doc = '';
    if (p.tipoPessoa === 'PJ') {
      doc = (cnpjPJ || '').replace(/\D/g, '');
      if (!doc) {
        setMessage({ text: 'Informe CNPJ (somente números).', type: 'warn' });
        return;
      }
    } else {
      doc = (p.documento || '').replace(/\D/g, '');
      if (p.exige === 'dt_nasc' && !dtNasc.trim()) {
        setMessage({ text: 'Informe a data de nascimento.', type: 'warn' });
        return;
      }
    }

    if (!contract) {
      setMessage({ text: 'Informe o número do contrato.', type: 'warn' });
      return;
    }

    setIsLoadingFaturas(true);
    try {
      const faturasResult = await buscarFaturasFront(doc, contract);
      if (faturasResult.length === 0) {
        setMessage({ text: 'Nenhuma fatura pendente encontrada.', type: 'warn' });
      } else {
        setFaturas(faturasResult);
        setStep('faturas');
        setMessage({ text: 'Faturas carregadas com sucesso.', type: 'ok' });
      }
    } catch (e: any) {
      setMessage({ text: e.message || 'Erro inesperado.', type: 'err' });
    } finally {
      setIsLoadingFaturas(false);
    }
  };

  // ====== LÓGICA DE EVENTOS (Handlers) ======
  const handleConsultar = async () => {
    setMessage(null);
    setFaturas([]);
    setShowGerarBoleto(false);
    setBoletoURL(null);

    const cleanCpf = (cpfCnpj || '').replace(/\D/g, '');
    const cleanContrato = (contrato || '').replace(/\D/g, '');

    if (!cleanCpf || !cleanContrato) {
      setMessage({ text: 'Informe CPF/CNPJ e contrato (somente números).', type: 'warn' });
      return;
    }

    setIsLoadingFaturas(true);
    try {
      const faturasResult = await buscarFaturasFront(cleanCpf, cleanContrato);
      if (faturasResult.length === 0) {
        setMessage({ text: 'Nenhuma fatura pendente encontrada.', type: 'warn' });
      } else {
        setFaturas(faturasResult);
        setMessage({ text: 'Faturas carregadas com sucesso.', type: 'ok' });
      }
    } catch (e: any) {
      setMessage({ text: e.message || 'Erro inesperado.', type: 'err' });
    } finally {
      setIsLoadingFaturas(false);
    }
  };

  const handleGerarBoleto = async () => {
      setMessage(null);
      setBoletoURL(null);
      setShowEmailInput(false);
      setShowPdfViewer(false);

      if (!numeroFatura.trim()) {
          setMessage({ text: 'Digite o número da fatura.', type: 'warn' });
          return;
      }
      
      const existe = faturas.some(f => String(f.numerofatura) === String(numeroFatura));
      if (!existe) {
          setMessage({ text: 'O número informado não está na lista de faturas pendentes.', type: 'warn' });
          return;
      }
      
      setIsLoadingBoleto(true);
      try {
          const url = await buscarBoletoFront(numeroFatura);
          if (!url) {
              setMessage({ text: 'Não foi possível obter a URL do boleto.', type: 'warn' });
              return;
          }
          setBoletoURL(url);
          setNumeroSelecionado(numeroFatura);
          setMessage({ text: 'Boleto gerado! Escolha uma ação abaixo.', type: 'ok' });
      } catch (e: any) {
          setMessage({ text: e.message || 'Erro ao gerar boleto.', type: 'err' });
      } finally {
          setIsLoadingBoleto(false);
      }
  };
    
  const handleEnviarEmail = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailDestino || !emailRegex.test(emailDestino)) {
      Alert.alert('Atenção', 'Por favor, informe um e-mail válido.');
      return;
    }
    if (!boletoURL || !numeroSelecionado) return;

    setIsSendingEmail(true);
    try {
        await enviarBoletoEmailFront(emailDestino, boletoURL, numeroSelecionado);
        Alert.alert('Sucesso!', 'E-mail enviado com sucesso!');
        setShowEmailInput(false);
        setEmailDestino('');
    } catch (e: any) {
        Alert.alert('Erro', e.message || 'Falha ao enviar o e-mail.');
    } finally {
        setIsSendingEmail(false);
    }
  };

  // ====== HELPERS DE RENDERIZAÇÃO ======
  const renderFaturasTable = (faturasList: Fatura[]) => (
    <View style={styles.table}>
      {/* Cabeçalho */}
      <View style={[styles.tableRow, styles.tableHeader]}>
        <Text style={[styles.tableCell, styles.headerText, { flex: 0.5 }]}>#</Text>
        <Text style={[styles.tableCell, styles.headerText, { flex: 1.5 }]}>Número</Text>
        <Text style={[styles.tableCell, styles.headerText, { flex: 1.5 }]}>Vencimento</Text>
        <Text style={[styles.tableCell, styles.headerText]}>Valor</Text>
      </View>
      {/* Corpo */}
      {faturasList.map((f, i) => (
        <View style={styles.tableRow} key={f.numerofatura}>
          <Text style={[styles.tableCell, { flex: 0.5 }]}>{i + 1}</Text>
          <Text style={[styles.tableCell, { flex: 1.5 }]}>{f.numerofatura}</Text>
          <Text style={[styles.tableCell, { flex: 1.5 }]}>{f.vencimentofatura}</Text>
          <Text style={[styles.tableCell]}>{f.valorfatura}</Text>
        </View>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.card}>
          <Text style={styles.h1}>🔐 Consulta de Faturas & Boleto</Text>
          <Text style={styles.mutedSmall}>
            Consulte suas faturas pendentes e gere o boleto de forma rápida e segura.
          </Text>

          {/* Form Identificação */}
          <View style={styles.divider} />
          <Text style={styles.label}>CPF/CNPJ</Text>
          <TextInput
            style={styles.input}
            placeholder="Somente números"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={cpfCnpj}
            onChangeText={setCpfCnpj}
          />

          <Text style={styles.label}>Nº do contrato</Text>
          <TextInput
            style={styles.input}
            placeholder="Somente números"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={contrato}
            onChangeText={setContrato}
          />
          
          <TouchableOpacity style={styles.button} onPress={handleConsultar} disabled={isLoadingFaturas}>
            {isLoadingFaturas ? (
              <ActivityIndicator color={colors.btnText} />
            ) : (
              <Text style={styles.buttonText}>Consultar faturas</Text>
            )}
          </TouchableOpacity>
          
          {/* Novo Wizard de Identificação e Dados */}
          <View style={styles.divider} />
          {step === 'ident' && (
            <>
              <Text style={styles.label}>CPF/CNPJ</Text>
              <TextInput
                style={styles.input}
                placeholder="Somente números"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={documento}
                onChangeText={setDocumento}
              />
              <TouchableOpacity style={styles.button} onPress={handleValidarIdentificacao} disabled={isLoadingFaturas}>
                {isLoadingFaturas ? (
                  <ActivityIndicator color={colors.btnText} />
                ) : (
                  <Text style={styles.buttonText}>Validar identificação</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {step !== 'ident' && pessoa && (
            <View style={{ marginTop: 8 }}>
              <Text style={styles.mutedSmall}>
                {`Usuário: ${pessoa.nome ?? '—'} • ${pessoa.tipoPessoa}`}
              </Text>
            </View>
          )}

          {step === 'dados' && pessoa && (
            <>
              {pessoa.tipoPessoa === 'PJ' ? (
                <>
                  <Text style={styles.label}>CNPJ</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Somente números"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={cnpjPJ}
                    onChangeText={setCnpjPJ}
                  />
                  <Text style={styles.label}>Nº do contrato</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Somente números"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={contrato}
                    onChangeText={setContrato}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Nº do contrato</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Somente números"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={contrato}
                    onChangeText={setContrato}
                  />
                  {pessoa.exige === 'dt_nasc' && (
                    <>
                      <Text style={styles.label}>Data de nascimento</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="DD/MM/AAAA"
                        placeholderTextColor={colors.muted}
                        keyboardType="default"
                        value={dtNasc}
                        onChangeText={setDtNasc}
                      />
                    </>
                  )}
                </>
              )}
              <TouchableOpacity style={styles.button} onPress={handleBuscarFaturas} disabled={isLoadingFaturas}>
                {isLoadingFaturas ? (
                  <ActivityIndicator color={colors.btnText} />
                ) : (
                  <Text style={styles.buttonText}>Buscar faturas</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {message && (
             <View style={[styles.status, styles[`status_${message.type}`]]}>
               <Text style={[styles.statusText, styles[`statusText_${message.type}`]]}>
                  {message.text}
               </Text>
             </View>
          )}

          {/* Lista de faturas */}
          {faturas.length > 0 && (
            <View style={styles.mt}>
              <View style={styles.divider} />
              <Text style={styles.h2}>📄 Faturas encontradas</Text>
              {renderFaturasTable(faturas)}
              <TouchableOpacity style={[styles.button, styles.btnPlain, styles.mt]} onPress={() => setShowGerarBoleto(true)}>
                  <Text style={[styles.buttonText, styles.btnPlainText]}>Deseja gerar um boleto?</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Seção gerar boleto */}
          {showGerarBoleto && (
             <View style={styles.mt}>
                <View style={styles.divider} />
                <Text style={styles.h2}>🧾 Gerar boleto</Text>
                <Text style={styles.mutedSmall}>Digite o número exato da fatura.</Text>
                
                <Text style={styles.label}>Número da fatura</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Ex.: 1362628"
                    placeholderTextColor={colors.muted}
                    keyboardType="numeric"
                    value={numeroFatura}
                    onChangeText={setNumeroFatura}
                />
                
                <TouchableOpacity style={styles.button} onPress={handleGerarBoleto} disabled={isLoadingBoleto}>
                    {isLoadingBoleto ? (
                        <ActivityIndicator color={colors.btnText} />
                    ) : (
                        <Text style={styles.buttonText}>Gerar link do boleto (PDF)</Text>
                    )}
                </TouchableOpacity>

                {/* Resultado + Ações */}
                {boletoURL && (
                    <View style={styles.mt}>
                        <TouchableOpacity style={styles.linkButton} onPress={() => Linking.openURL(boletoURL)}>
                            <Text style={styles.linkText}>Abrir/baixar boleto no navegador</Text>
                        </TouchableOpacity>

                        <View style={styles.divider} />
                        
                        <View style={styles.toolbar}>
                            <TouchableOpacity style={[styles.button, styles.btnSuccess]} onPress={() => Linking.openURL(`${API_BASE}/api/pdf-download?url=${encodeURIComponent(boletoURL)}`)}>
                                <Text style={styles.buttonText}>⬇️ Baixar</Text>
                            </TouchableOpacity>
                             <TouchableOpacity style={[styles.button, styles.btnWarn]} onPress={() => setShowEmailInput(!showEmailInput)}>
                                <Text style={styles.buttonText}>✉️ E-mail</Text>
                            </TouchableOpacity>
                             <TouchableOpacity style={[styles.button, styles.btnView]} onPress={() => setShowPdfViewer(!showPdfViewer)}>
                                <Text style={styles.buttonText}>👁️ Visualizar</Text>
                            </TouchableOpacity>
                        </View>
                        
                        {showEmailInput && (
                            <View style={styles.emailBox}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }]}
                                    placeholder="email@dominio.com"
                                    placeholderTextColor={colors.muted}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    value={emailDestino}
                                    onChangeText={setEmailDestino}
                                />
                                <TouchableOpacity style={[styles.button, styles.btnWarn, {marginLeft: 10}]} onPress={handleEnviarEmail} disabled={isSendingEmail}>
                                    {isSendingEmail ? <ActivityIndicator color="#3b1d00" /> : <Text style={styles.buttonText}>Enviar</Text>}
                                </TouchableOpacity>
                            </View>
                        )}

                        {/* ================= INÍCIO DA MUDANÇA 4 ================= */}
                        {showPdfViewer && boletoURL && (
                          <View style={styles.viewer}>
                            {Platform.OS === 'web' ? (
                              // Para a WEB: renderize um <iframe> HTML puro
                              <iframe
                                src={`${API_BASE}/api/pdf?url=${encodeURIComponent(boletoURL)}`}
                                style={{ width: '100%', height: '100%', border: 'none' }}
                                title="Boleto PDF"
                              />
                            ) : (
                              // Para iOS e Android: use o componente do state
                              WebViewComponent ? (
                                <WebViewComponent
                                  source={{ uri: `${API_BASE}/api/pdf?url=${encodeURIComponent(boletoURL)}` }}
                                  style={{ flex: 1 }}
                                />
                              ) : (
                                // Mostra um loading enquanto o componente nativo carrega
                                <ActivityIndicator color={colors.acc} size="large" />
                              )
                            )}
                          </View>
                        )}
                        {/* =================== FIM DA MUDANÇA 4 =================== */}
                        
                    </View>
                )}
             </View>
          )}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

// ====== ESTILOS (StyleSheet) ======
const colors = {
  bg: '#0f172a',
  card: '#111827',
  muted: '#cbd5e1',
  ok: '#22c55e',
  warn: '#f59e0b',
  err: '#ef4444',
  acc: '#38bdf8',
  border: '#334155',
  inputBg: '#0b1220',
  white: '#ffffff',
  btnPrimary: '#0ea5e9',
  btnText: '#002133',
  okBg: '#052e1a',
  okBorder: '#14532d',
  okText: '#86efac',
  warnBg: '#3b2a03',
  warnBorder: '#713f12',
  warnText: '#fde68a',
  errBg: '#3b0b0b',
  errBorder: '#7f1d1d',
  errText: '#fecaca',
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    padding: 24,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 18,
    // Sombra para iOS e Android
    ...Platform.select({
        ios: {
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.25,
            shadowRadius: 24,
        },
        android: {
            elevation: 10,
        },
    }),
  },
  h1: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 8,
  },
  h2: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.white,
    marginBottom: 10,
  },
  mutedSmall: {
    color: colors.muted,
    fontSize: 13,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 12,
    marginBottom: 6,
  },
  input: {
    width: '100%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    color: colors.white,
    fontSize: 16,
  },
  button: {
    marginTop: 16,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.btnPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.btnText,
    fontWeight: '600',
    fontSize: 16,
  },
  mt: {
    marginTop: 16,
  },
  divider: {
    height: 1,
    backgroundColor: '#1f2937',
    marginVertical: 18,
  },
  status: {
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 14,
  },
  status_ok: { backgroundColor: colors.okBg, borderColor: colors.okBorder },
  statusText_ok: { color: colors.okText },
  status_warn: { backgroundColor: colors.warnBg, borderColor: colors.warnBorder },
  statusText_warn: { color: colors.warnText },
  status_err: { backgroundColor: colors.errBg, borderColor: colors.errBorder },
  statusText_err: { color: colors.errText },
  // Estilos da Tabela
  table: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  tableHeader: {
    backgroundColor: '#1f2937',
  },
  tableCell: {
    padding: 10,
    fontSize: 14,
    color: colors.muted,
    flex: 1,
  },
  headerText: {
    color: '#c7d2fe',
    fontWeight: 'bold',
  },
  // Botões de Ação
  btnPlain: {
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: colors.border,
  },
  btnPlainText: {
      color: colors.muted,
  },
  linkButton: {
      backgroundColor: colors.okBg,
      borderColor: colors.okBorder,
      borderWidth: 1,
      borderRadius: 10,
      padding: 12,
      alignItems: 'center',
  },
  linkText: {
      color: colors.acc,
      fontWeight: 'bold',
      textDecorationLine: 'underline',
  },
  toolbar: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 16,
      gap: 10,
  },
  btnSuccess: { backgroundColor: colors.ok },
  btnWarn: { backgroundColor: colors.warn, color: '#3b1d00' },
  btnView: { backgroundColor: colors.acc, color: '#02233a' },
  emailBox: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 16,
  },
  viewer: {
      marginTop: 14,
      height: 500, // Altura fixa para o visualizador
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      overflow: 'hidden',
      // Adicionado para centralizar o ActivityIndicator
      alignItems: 'center',
      justifyContent: 'center',
  }
});

export default ConsultaFaturas;
