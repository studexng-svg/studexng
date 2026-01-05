from rest_framework import serializers
from .models import Wallet, WalletTransaction, EscrowTransaction, BankAccount


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ['id', 'user', 'balance', 'account_number', 'blockchain_address']


class WalletTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = WalletTransaction
        fields = ['id', 'wallet', 'type', 'amount', 'status', 'description', 'reference', 'created_at']


class EscrowSerializer(serializers.ModelSerializer):
    class Meta:
        model = EscrowTransaction
        fields = ['id', 'order', 'total_amount', 'seller_amount', 'platform_fee', 'status', 'created_at']


class BankAccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = BankAccount
        fields = ['id', 'account_number', 'bank_code', 'bank_name', 'account_holder_name', 'is_verified', 'created_at']