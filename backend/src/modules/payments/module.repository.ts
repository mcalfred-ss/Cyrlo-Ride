import type { PrismaClient } from '@prisma/client';

/** Private to the payments module. */
export class PaymentsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  protected database(): PrismaClient {
    return this.prisma;
  }

  async findPaymentByReference(providerReference: string) {
    return this.prisma.payment.findUnique({
      where: { providerReference },
      include: {
        booking: true,
        user: { select: { id: true, status: true, phoneNumber: true } },
      },
    });
  }

  async findBookingFeePayment(bookingId: string, userId: string) {
    return this.prisma.payment.findFirst({
      where: {
        bookingId,
        userId,
        purpose: 'BOOKING_FEE',
      },
      orderBy: { createdAt: 'desc' },
      include: { booking: true },
    });
  }

  async findRefund(refundId: string) {
    return this.prisma.paymentRefund.findUnique({
      where: { id: refundId },
      include: { payment: true },
    });
  }

  async listRefunds(
    status?: 'REQUESTED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'MANUAL_RECONCILIATION',
  ) {
    return this.prisma.paymentRefund.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'asc' },
      take: 100,
      include: {
        payment: {
          select: {
            id: true,
            providerReference: true,
            amountPesewas: true,
            status: true,
            bookingId: true,
          },
        },
      },
    });
  }
}
