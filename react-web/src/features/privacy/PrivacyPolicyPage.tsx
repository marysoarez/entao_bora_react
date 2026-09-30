import { useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import "./privacy.css";

export function PrivacyPolicyPage() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Política de Privacidade — Então Bora";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <article className="privacy-page" aria-labelledby="privacy-title">
      <Link className="privacy-back" to="/">
        <ArrowLeft size={16} aria-hidden="true" /> Voltar ao início
      </Link>
      <header className="privacy-heading">
        <span className="eyebrow">
          <ShieldCheck size={18} aria-hidden="true" /> ENTÃO BORA
        </span>
        <h1 id="privacy-title">Política de Privacidade</h1>
      </header>
      <div className="privacy-layout">
        <nav
          className="privacy-index"
          aria-label="Índice da política de privacidade"
        >
          <h2>Nesta página</h2>
          <ul>
            <li>
              <a href="#secao-1">1. Sobre o Então Bora</a>
            </li>
            <li>
              <a href="#secao-2">2. Dados que podemos coletar</a>
            </li>
            <li>
              <a href="#secao-3">3. Notificações</a>
            </li>
            <li>
              <a href="#secao-4">4. Como utilizamos seus dados</a>
            </li>
            <li>
              <a href="#secao-5">5. Mapas de interesse e estatísticas</a>
            </li>
            <li>
              <a href="#secao-6">6. Compartilhamento de dados</a>
            </li>
            <li>
              <a href="#secao-7">7. Segurança</a>
            </li>
            <li>
              <a href="#secao-8">8. Retenção dos dados</a>
            </li>
            <li>
              <a href="#secao-9">9. Exclusão da conta e dos dados</a>
            </li>
            <li>
              <a href="#secao-10">10. Direitos do usuário</a>
            </li>
            <li>
              <a href="#secao-11">11. Permissões do dispositivo</a>
            </li>
            <li>
              <a href="#secao-12">12. Serviços de terceiros</a>
            </li>
            <li>
              <a href="#secao-13">13. Crianças e adolescentes</a>
            </li>
            <li>
              <a href="#secao-14">14. Alterações nesta Política</a>
            </li>
            <li>
              <a href="#secao-15">15. Contato</a>
            </li>
          </ul>
        </nav>
        <div className="privacy-content">
          <p>
            <strong>Última atualização: 23 de setembro de 2026</strong>
          </p>
          <p>
            O <strong>Então Bora</strong> respeita a sua privacidade e está
            comprometido com a proteção dos seus dados pessoais.
          </p>
          <p>
            Esta Política de Privacidade explica quais informações podem ser
            coletadas ao utilizar o aplicativo e a plataforma Então Bora, como
            essas informações são utilizadas, armazenadas e protegidas e quais
            são os seus direitos em relação aos seus dados.
          </p>
          <p>
            Ao utilizar o Então Bora, você reconhece as práticas descritas nesta
            Política de Privacidade.
          </p>
          <h2 id="secao-1">1. Sobre o Então Bora</h2>
          <p>
            O <strong>Então Bora</strong> é uma plataforma destinada à
            descoberta e divulgação de eventos, estabelecimentos, experiências e
            atividades de entretenimento.
          </p>
          <p>Entre suas funcionalidades estão:</p>
          <ul>
            <li>descoberta de eventos e estabelecimentos;</li>
            <li>visualização de locais e eventos em mapas;</li>
            <li>
              indicação de interesse em eventos por meio da funcionalidade
              “Bora”;
            </li>
            <li>check-in em eventos e estabelecimentos;</li>
            <li>criação e divulgação de eventos;</li>
            <li>
              notificações relacionadas a eventos e atividades da plataforma;
            </li>
            <li>recursos para usuários e estabelecimentos parceiros;</li>
            <li>estatísticas e indicadores de interesse e participação.</li>
          </ul>
          <h2 id="secao-2">2. Dados que podemos coletar</h2>
          <p>
            Dependendo das funcionalidades utilizadas, o Então Bora poderá
            coletar as seguintes informações.
          </p>
          <h3>2.1. Dados de cadastro e autenticação</h3>
          <p>
            Quando você realiza login utilizando serviços de autenticação, como
            sua conta Google, podemos receber informações disponibilizadas pelo
            provedor de autenticação, tais como:
          </p>
          <ul>
            <li>nome;</li>
            <li>endereço de e-mail;</li>
            <li>foto de perfil;</li>
            <li>identificador da conta;</li>
            <li>
              informações necessárias para autenticação e manutenção da sessão.
            </li>
          </ul>
          <p>
            O Então Bora também poderá permitir determinadas formas de acesso
            sem identificação completa do usuário, como autenticação anônima.
          </p>
          <p>Não recebemos nem armazenamos a senha da sua conta Google.</p>
          <h3>2.2. Dados de localização</h3>
          <p>
            Com sua autorização, o Então Bora poderá acessar a localização
            aproximada ou precisa do dispositivo.
          </p>
          <p>A localização poderá ser utilizada para:</p>
          <ul>
            <li>exibir eventos e estabelecimentos próximos;</li>
            <li>calcular distâncias;</li>
            <li>posicionar o usuário no mapa;</li>
            <li>permitir funcionalidades relacionadas a check-in;</li>
            <li>
              identificar atividades e eventos relevantes próximos ao usuário;
            </li>
            <li>
              gerar informações agregadas, como mapas de interesse ou
              concentração de usuários.
            </li>
          </ul>
          <p>
            Quando necessário, o aplicativo solicitará a permissão
            correspondente do sistema operacional.
          </p>
          <p>
            O usuário poderá alterar ou revogar a permissão de localização nas
            configurações do dispositivo.
          </p>
          <h3>2.3. Interações dentro da plataforma</h3>
          <p>
            Podemos registrar determinadas ações realizadas no Então Bora,
            incluindo:
          </p>
          <ul>
            <li>eventos visualizados;</li>
            <li>eventos marcados com “Bora”;</li>
            <li>check-ins;</li>
            <li>eventos criados;</li>
            <li>estabelecimentos ou eventos associados ao usuário;</li>
            <li>interações com funcionalidades da plataforma;</li>
            <li>data e horário das interações.</li>
          </ul>
          <p>
            Essas informações são utilizadas para fornecer as funcionalidades
            solicitadas, manter históricos associados à conta e produzir
            métricas e estatísticas da plataforma.
          </p>
          <h3>2.4. Conteúdo enviado pelo usuário</h3>
          <p>
            Ao criar ou editar eventos, estabelecimentos ou outras informações
            na plataforma, podemos armazenar conteúdos fornecidos por você,
            como:
          </p>
          <ul>
            <li>nome e descrição de eventos;</li>
            <li>imagens;</li>
            <li>endereço;</li>
            <li>datas e horários;</li>
            <li>links;</li>
            <li>informações de ingressos;</li>
            <li>informações de estabelecimentos;</li>
            <li>outros dados necessários para publicação do conteúdo.</li>
          </ul>
          <p>
            Determinadas informações são públicas por natureza e poderão ser
            visualizadas por outros usuários da plataforma.
          </p>
          <h3>2.5. Dados técnicos e de uso</h3>
          <p>
            Podemos coletar automaticamente determinadas informações técnicas
            necessárias para segurança, funcionamento, diagnóstico e melhoria da
            plataforma, como:
          </p>
          <ul>
            <li>informações sobre dispositivo e sistema operacional;</li>
            <li>versão do aplicativo;</li>
            <li>registros técnicos;</li>
            <li>falhas e erros do aplicativo;</li>
            <li>
              identificadores técnicos necessários ao funcionamento dos
              serviços;
            </li>
            <li>informações de desempenho;</li>
            <li>informações relacionadas ao uso das funcionalidades.</li>
          </ul>
          <p>
            Esses dados podem ser processados por serviços de infraestrutura e
            análise utilizados pelo Então Bora.
          </p>
          <h2 id="secao-3">3. Notificações</h2>
          <p>
            Com a sua autorização, o Então Bora poderá enviar notificações push.
          </p>
          <p>As notificações podem incluir informações sobre:</p>
          <ul>
            <li>eventos criados ou atualizados;</li>
            <li>eventos próximos;</li>
            <li>lembretes de eventos;</li>
            <li>atividades relacionadas aos seus “Boras”;</li>
            <li>estabelecimentos e eventos relevantes;</li>
            <li>
              informações importantes sobre sua conta ou sobre a plataforma.
            </li>
          </ul>
          <p>
            O envio de notificações poderá utilizar identificadores técnicos do
            dispositivo, como tokens de notificação.
          </p>
          <p>
            Você poderá desativar as notificações a qualquer momento nas
            configurações do dispositivo.
          </p>
          <h2 id="secao-4">4. Como utilizamos seus dados</h2>
          <p>Os dados coletados poderão ser utilizados para:</p>
          <ul>
            <li>criar e autenticar contas;</li>
            <li>manter a sessão do usuário;</li>
            <li>fornecer as funcionalidades do Então Bora;</li>
            <li>mostrar eventos e estabelecimentos próximos;</li>
            <li>permitir check-ins e registros de interesse;</li>
            <li>enviar notificações solicitadas ou relacionadas ao serviço;</li>
            <li>permitir criação e gerenciamento de eventos;</li>
            <li>
              disponibilizar funcionalidades para estabelecimentos parceiros;
            </li>
            <li>gerar métricas e estatísticas;</li>
            <li>identificar e corrigir erros;</li>
            <li>melhorar desempenho e experiência de uso;</li>
            <li>prevenir fraude, abuso e atividades maliciosas;</li>
            <li>proteger usuários e a plataforma;</li>
            <li>cumprir obrigações legais.</li>
          </ul>
          <p>Não vendemos dados pessoais dos usuários.</p>
          <h2 id="secao-5">5. Mapas de interesse e estatísticas</h2>
          <p>
            O Então Bora poderá utilizar informações de interação, como “Boras”,
            check-ins e outras atividades, para produzir estatísticas sobre
            eventos e estabelecimentos.
          </p>
          <p>
            Essas informações também poderão ser utilizadas para recursos
            visuais, como mapas de calor ou indicadores de interesse e
            movimentação.
          </p>
          <p>
            Sempre que possível, informações apresentadas publicamente ou a
            parceiros serão agregadas de forma a evitar a exposição
            desnecessária da localização individual de usuários.
          </p>
          <h2 id="secao-6">6. Compartilhamento de dados</h2>
          <p>
            O Então Bora poderá utilizar fornecedores de tecnologia necessários
            para o funcionamento da plataforma.
          </p>
          <p>
            Esses fornecedores podem processar determinadas informações
            exclusivamente de acordo com a finalidade do serviço contratado.
          </p>
          <p>
            Entre os serviços utilizados poderão estar tecnologias relacionadas
            a:
          </p>
          <ul>
            <li>hospedagem e banco de dados;</li>
            <li>autenticação;</li>
            <li>armazenamento de arquivos;</li>
            <li>mapas e geolocalização;</li>
            <li>envio de notificações;</li>
            <li>análise de desempenho;</li>
            <li>diagnóstico de falhas;</li>
            <li>segurança e infraestrutura.</li>
          </ul>
          <p>
            O Então Bora utiliza serviços do Google e Firebase para determinadas
            funcionalidades da plataforma.
          </p>
          <p>
            Também poderemos compartilhar informações quando necessário para:
          </p>
          <ul>
            <li>cumprir obrigação legal;</li>
            <li>atender determinação judicial ou de autoridade competente;</li>
            <li>investigar fraude ou abuso;</li>
            <li>
              proteger os direitos e a segurança dos usuários ou da plataforma.
            </li>
          </ul>
          <h2 id="secao-7">7. Segurança</h2>
          <p>
            Adotamos medidas técnicas e organizacionais destinadas à proteção
            das informações armazenadas e transmitidas pela plataforma.
          </p>
          <p>Entre essas medidas poderão estar:</p>
          <ul>
            <li>comunicação criptografada por HTTPS;</li>
            <li>mecanismos de autenticação;</li>
            <li>regras de controle de acesso;</li>
            <li>controle de permissões;</li>
            <li>infraestrutura de serviços especializados;</li>
            <li>monitoramento de erros e segurança.</li>
          </ul>
          <p>
            Apesar dessas medidas, nenhum sistema conectado à internet pode
            garantir segurança absoluta.
          </p>
          <h2 id="secao-8">8. Retenção dos dados</h2>
          <p>
            Os dados pessoais serão mantidos somente pelo período necessário
            para:
          </p>
          <ul>
            <li>fornecer os serviços do Então Bora;</li>
            <li>manter a conta do usuário;</li>
            <li>cumprir as finalidades descritas nesta Política;</li>
            <li>cumprir obrigações legais;</li>
            <li>prevenir fraude e abuso;</li>
            <li>resolver disputas ou exercer direitos.</li>
          </ul>
          <p>
            Quando os dados deixarem de ser necessários, poderão ser excluídos
            ou anonimizados, observadas eventuais obrigações legais de retenção.
          </p>
          <h2 id="secao-9">9. Exclusão da conta e dos dados</h2>
          <p>
            O usuário poderá solicitar a exclusão da sua conta e dos dados
            pessoais associados.
          </p>
          <p>
            A solicitação poderá ser realizada diretamente pelas funcionalidades
            disponibilizadas pelo Então Bora ou através do canal de exclusão de
            conta disponibilizado em nosso site.
          </p>
          <p>
            Após a solicitação, os dados associados à conta serão excluídos ou
            anonimizados, exceto quando sua manutenção for necessária para
            cumprimento de obrigação legal, prevenção de fraude, segurança ou
            exercício regular de direitos.
          </p>
          <p>
            Conteúdos públicos criados pelo usuário poderão ser removidos,
            anonimizados ou desvinculados da conta, conforme aplicável.
          </p>
          <h2 id="secao-10">10. Direitos do usuário</h2>
          <p>
            Nos termos da legislação aplicável, incluindo a Lei Geral de
            Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018), o usuário
            poderá solicitar, quando aplicável:
          </p>
          <ul>
            <li>confirmação da existência de tratamento;</li>
            <li>acesso aos dados pessoais;</li>
            <li>correção de dados incompletos ou incorretos;</li>
            <li>informações sobre o tratamento dos dados;</li>
            <li>exclusão de dados;</li>
            <li>anonimização ou bloqueio;</li>
            <li>revogação de consentimento;</li>
            <li>demais direitos previstos na legislação aplicável.</li>
          </ul>
          <p>
            Solicitações poderão exigir procedimentos de confirmação da
            identidade do titular para proteção da conta e dos dados.
          </p>
          <h2 id="secao-11">11. Permissões do dispositivo</h2>
          <p>
            Algumas funcionalidades poderão solicitar permissões específicas do
            dispositivo, como localização e notificações.
          </p>
          <p>
            Essas permissões serão solicitadas quando necessárias para
            determinada funcionalidade e poderão ser revogadas pelo usuário
            através das configurações do sistema operacional.
          </p>
          <p>
            A recusa ou revogação de determinada permissão poderá limitar apenas
            as funcionalidades que dependem dela.
          </p>
          <h2 id="secao-12">12. Serviços de terceiros</h2>
          <p>
            Algumas funcionalidades dependem de serviços fornecidos por
            terceiros.
          </p>
          <p>
            Esses serviços poderão possuir suas próprias políticas e práticas de
            privacidade.
          </p>
          <p>
            Recomendamos que os usuários também consultem as políticas dos
            serviços utilizados quando desejarem informações adicionais sobre o
            tratamento realizado diretamente por esses fornecedores.
          </p>
          <h2 id="secao-13">13. Crianças e adolescentes</h2>
          <p>O Então Bora não é direcionado especificamente a crianças.</p>
          <p>
            Caso sejam identificados dados pessoais de crianças tratados de
            maneira incompatível com a legislação aplicável, poderão ser
            adotadas medidas para sua exclusão e proteção.
          </p>
          <h2 id="secao-14">14. Alterações nesta Política</h2>
          <p>
            Esta Política de Privacidade poderá ser atualizada para refletir
            alterações na plataforma, legislação, tecnologias utilizadas ou
            práticas relacionadas ao tratamento de dados.
          </p>
          <p>
            A versão mais recente estará sempre disponível nos canais oficiais
            do Então Bora.
          </p>
          <p>
            Quando houver alterações relevantes, poderemos informar os usuários
            através da plataforma ou de outros meios adequados.
          </p>
          <h2 id="secao-15">15. Contato</h2>
          <p>
            Em caso de dúvidas, solicitações relacionadas à privacidade ou
            exercício de direitos relacionados aos seus dados pessoais, entre em
            contato através dos canais oficiais disponibilizados pelo{" "}
            <strong>Então Bora</strong>.
          </p>
          <p>
            <strong>Então Bora</strong>
            <br />
            Rio de Janeiro – RJ, Brasil
            <br />
            Site: <a href="https://entaobora.com.br">entaobora.com.br</a>
          </p>
          <hr />
          <p>
            <strong>Última atualização:</strong> 23 de setembro de 2026.
          </p>
        </div>
      </div>
    </article>
  );
}
