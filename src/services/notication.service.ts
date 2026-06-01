import { ClientRepository } from '../repositories/cliente.repositorie.js';
import { InvoiceRepository } from '../repositories/invoice.repository.js'; // 💡 Nova importação
import { TriggerNotificationDTO } from '../dtos/triggerNotification.dto.js';
import { WhatsappAPI } from '../apis/whatsapp.api.js';

export class NotificationService {
  private clientRepository: ClientRepository;
  private invoiceRepository: InvoiceRepository; // 💡 Nova propriedade
  private whatsappAPI: WhatsappAPI;

  constructor() {
    this.clientRepository = new ClientRepository();
    this.invoiceRepository = new InvoiceRepository(); // 💡 Inicializa o repositório
    this.whatsappAPI = new WhatsappAPI();
  }

  async execute(data: TriggerNotificationDTO): Promise<boolean> {
    // 1. Busca o cliente para garantir que ele existe
    const client = await this.clientRepository.findByPhone(data.phone);

    if (!client) {
      throw new Error("Cliente não cadastrado no banco de dados do SaaS.");
    }

    // 2. Gera os dados fakes do "Gateway"
    const fakeGatewayId = "pay_fake_" + Math.random().toString(36).substring(7);
    const fakePixCode = "00020101021226880014br.gov.bcb.pix...COPIA_E_COLA_FAKE_" + client.id;

    // 3. 💡 SALVA A INVOICE NO BANCO DE DADOS VIA PRISMA
    // Isso garante que a fatura exista no banco com o status PENDING
    await this.invoiceRepository.create({
      clientId: client.id,
      value: Number(data.debtValue || 0),
      dueDate: new Date(), // Vence hoje para fins de teste
      gatewayId: fakeGatewayId,
      pixCopyPaste: fakePixCode
    });

    // 4. Cria o link apontando para a tela que criamos
    const linkPagamentoFake =`http://localhost:3333/pages/payments.screen.html?invoiceId=${fakeGatewayId}&value=${data.debtValue}`;

    console.log("============== DADOS RECEBIDOS PARA DISPARO ==============");
    console.log("Cliente:", client.name, "| Telefone:", client.phone);
    console.log("Valor da Dívida:", data.debtValue);
    console.log("Documento:", data.document);
    console.log("Link de Pagamento (Fake):", linkPagamentoFake);
    console.log(data)
    console.log("===========================================================");
    const mensagemWhatsapp = {
      targetPhone: client.phone,
      messagePayload: `Olá, ${client.name}! Constatamos um débito de R$ ${data.debtValue}.\n\n` +
        `👉 Pague via PIX Copia e Cola:\n\`${fakePixCode}\`\n\n` +
        `🔗 Ou acesse a página de pagamento para ver o QR Code:\n${linkPagamentoFake}`
    };

    const whatsappMessage = this.whatsappAPI.sendMessageWhatsapp(data, mensagemWhatsapp);

    console.log("============== WHATSAPP ENVIADO (MOCK) ==============");
    console.log(mensagemWhatsapp.messagePayload);
    console.log("=====================================================");

    return true; // Indica que o processo foi concluído (mesmo que seja um mock)
  }
}