import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Wallet System API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('should create a wallet', async () => {
    const response = await request(app.getHttpServer())
      .post('/wallets')
      .send({ initialBalance: 100 });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('id');
    expect(response.body.balance).toBe(100);
  });

  it('should deposit funds into a wallet', async () => {
    const wallet = await request(app.getHttpServer())
      .post('/wallets')
      .send({ initialBalance: 50 });

    const response = await request(app.getHttpServer())
      .post(`/wallets/${wallet.body.id}/deposit`)
      .send({ amount: 30 });

    expect(response.status).toBe(201);
    expect(response.body.amount).toBe(30);
  });

  it('should withdraw funds from a wallet', async () => {
    const wallet = await request(app.getHttpServer())
      .post('/wallets')
      .send({ initialBalance: 100 });

    const response = await request(app.getHttpServer())
      .post(`/wallets/${wallet.body.id}/withdraw`)
      .send({ amount: 40 });

    expect(response.status).toBe(201);
    expect(response.body.amount).toBe(40);
  });

  it('should transfer funds between wallets', async () => {
    const wallet1 = await request(app.getHttpServer())
      .post('/wallets')
      .send({ initialBalance: 200 });

    const wallet2 = await request(app.getHttpServer())
      .post('/wallets')
      .send({ initialBalance: 50 });

    const response = await request(app.getHttpServer())
      .post(`/wallets/${wallet1.body.id}/transfer/${wallet2.body.id}`)
      .send({ amount: 100, transactionId: 'unique-transaction-id' });

    expect(response.status).toBe(201);
    expect(response.body.amount).toBe(100);
  });

  it('should retrieve transaction history', async () => {
    const wallet = await request(app.getHttpServer())
      .post('/wallets')
      .send({ initialBalance: 100 });

    await request(app.getHttpServer())
      .post(`/wallets/${wallet.body.id}/deposit`)
      .send({ amount: 50 });

    const response = await request(app.getHttpServer()).get(
      `/wallets/${wallet.body.id}/transactions?page=1&limit=10`,
    );

    expect(response.status).toBe(200);
    expect(response.body).toBeInstanceOf(Array);
  });
});
