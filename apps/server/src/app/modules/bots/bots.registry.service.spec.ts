import { Test, TestingModule } from '@nestjs/testing';
import { BotsRegistryService } from './bots.registry.service';

describe('BotsRegistryService', () => {
  let service: BotsRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [BotsRegistryService],
    }).compile();

    service = module.get<BotsRegistryService>(BotsRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
