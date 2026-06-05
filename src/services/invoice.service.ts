

import { InvoiceRepository } from '../repositories/invoice.repository.js';
import { CreateInvoiceDTO, UpdateInvoiceStatusDTO } from '../dtos/createInvoice.dto.js';

export class InvoiceService {
  private invoiceRepository: InvoiceRepository;

  constructor() {
    this.invoiceRepository = new InvoiceRepository();
  }

  async createPayment(data: CreateInvoiceDTO) {
    // 1. Aqui seu sistema chamaria o Gateway de Pagamento Real (ex: Asaas) via Axios/Fetch
    // const gatewayRes = await gatewayApi.gerarPix(data.value);

    // Simulação de dados retornados pelo gateway de pagamento externo
    const mockGatewayId = "pay_" + Math.random().toString(36).substring(7);
    const mockPixCode = "00020101021226880014br.gov.bcb.pix2564api.pix...";

    // 2. Salva a fatura no nosso banco local atrelada ao ID do Gateway
    const invoice = await this.invoiceRepository.create({
      ...data,
      gatewayId: mockGatewayId,
      pixCopyPaste: mockPixCode
    });

    return invoice;
  }

  async receiveWebhookNotification(data: UpdateInvoiceStatusDTO) {
    // Busca a fatura gerada anteriormente pelo ID do Gateway
    const invoice = await this.invoiceRepository.findByGatewayId(data.gatewayId);

    if (!invoice) {
      throw new Error("Fatura correspondente ao Gateway não encontrada.");
    }

    // Atualiza o status para PAID, FAILED, etc.
    const updatedInvoice = await this.invoiceRepository.updateStatus(
      invoice.id,
      data.status,
      data.paidAt
    );

    return updatedInvoice;
  }

  async findPendingInvoices(page?:number, limit?:number) {
    return this.invoiceRepository.findPendingInvoices(page, limit);
  }
}