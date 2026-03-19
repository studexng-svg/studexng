# loyalty/models.py
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class LoyaltyAccount(models.Model):
    """Tracks credit balance and booking count per user."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='loyalty')
    credit_balance = models.DecimalField(
        max_digits=10, decimal_places=2, default=0,
        help_text="StudEx credits available (₦1 = 1 credit)"
    )
    total_completed_orders = models.IntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.username} — ₦{self.credit_balance} credits, {self.total_completed_orders} orders"

    class Meta:
        verbose_name = "Loyalty Account"
        verbose_name_plural = "Loyalty Accounts"


class LoyaltyTransaction(models.Model):
    """Log of every credit earned or spent."""
    TYPE_CHOICES = (
        ('earned', 'Credits Earned'),
        ('redeemed', 'Credits Redeemed'),
        ('spent', 'Credits Spent'),
        ('expired', 'Credits Expired'),
    )
    account = models.ForeignKey(LoyaltyAccount, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=10, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    description = models.CharField(max_length=200)
    order = models.ForeignKey(
        'orders.Order', on_delete=models.SET_NULL, null=True, blank=True
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.account.user.username} {self.type} ₦{self.amount}"

    class Meta:
        ordering = ['-created_at']