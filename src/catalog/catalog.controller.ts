import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { CatalogService } from './catalog.service';

@ApiTags('catalog')
@Controller()
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('categories') categories() { return this.service.categories(); }
  @Get('amenities') amenities() { return this.service.amenities(); }
  @Get('transaction-types') transactionTypes() { return this.service.transactionTypes(); }
}
