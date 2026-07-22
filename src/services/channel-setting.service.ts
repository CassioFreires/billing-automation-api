import { ChannelSettingRepository } from '../repositories/channel-setting.repository.js';
import { UpdateChannelSettingsDTO } from '../dtos/channelSettings.dto.js';
import { NotifyChannel, DEFAULT_NOTIFY_CHANNEL } from '../domain/channels.js';

/** WhatsApp por padrão quando o tenant ainda não configurou (spec 0032). */
export class ChannelSettingService {
  private repository: ChannelSettingRepository;

  constructor(deps?: { repository?: ChannelSettingRepository }) {
    this.repository = deps?.repository ?? new ChannelSettingRepository();
  }

  /** Canal do tenant atual (com default) — para a tela e para o worker. */
  async get(): Promise<{ channel: NotifyChannel }> {
    const s = await this.repository.findByTenant();
    return { channel: (s?.channel as NotifyChannel) ?? DEFAULT_NOTIFY_CHANNEL };
  }

  async update(data: UpdateChannelSettingsDTO): Promise<{ channel: NotifyChannel }> {
    const s = await this.repository.upsert({ channel: data.channel });
    return { channel: s.channel as NotifyChannel };
  }
}
