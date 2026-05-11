import time
import requests
from django.core.management.base import BaseCommand
from django.conf import settings
from payments.models import SellerBankAccount

PAYSTACK_BASE = "https://api.paystack.co"


class Command(BaseCommand):
    help = "Backfill Paystack transfer recipient codes (RCP_xxx) for vendors who registered before the Transfer API migration."

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would happen without calling Paystack or saving anything.",
        )
        parser.add_argument(
            "--delay",
            type=float,
            default=0.3,
            help="Seconds to wait between Paystack API calls (default: 0.3). Avoid rate limiting.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        delay = options["delay"]

        secret_key = (getattr(settings, "PAYSTACK_SECRET_KEY", "") or "").strip()
        if not secret_key:
            self.stderr.write(self.style.ERROR("PAYSTACK_SECRET_KEY is not configured."))
            return

        headers = {"Authorization": f"Bearer {secret_key}", "Content-Type": "application/json"}

        qs = SellerBankAccount.objects.filter(
            paystack_recipient_code__isnull=True
        ).select_related("user") | SellerBankAccount.objects.filter(
            paystack_recipient_code=""
        ).select_related("user")

        # Union via Q to keep it one query
        from django.db.models import Q
        qs = SellerBankAccount.objects.filter(
            Q(paystack_recipient_code__isnull=True) | Q(paystack_recipient_code="")
        ).select_related("user")

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.SUCCESS("All vendors already have a recipient code. Nothing to do."))
            return

        self.stdout.write(f"Found {total} vendor(s) without a recipient code.")
        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN — no API calls or DB writes will be made.\n"))

        ok = 0
        failed = 0

        for account in qs.iterator():
            username = account.user.username
            label = f"{username} ({account.bank_name} ****{account.account_number[-4:]})"

            if not account.account_number or not account.bank_code or not account.account_name:
                self.stderr.write(self.style.WARNING(f"  SKIP  {label} — missing bank details"))
                failed += 1
                continue

            if dry_run:
                self.stdout.write(f"  WOULD call /transferrecipient for {label}")
                continue

            payload = {
                "type": "nuban",
                "name": account.account_name,
                "account_number": str(account.account_number),
                "bank_code": str(account.bank_code),
                "currency": "NGN",
            }

            try:
                res = requests.post(
                    f"{PAYSTACK_BASE}/transferrecipient",
                    headers=headers,
                    json=payload,
                    timeout=15,
                )
                res_json = res.json()

                if res.status_code in [200, 201] and res_json.get("status"):
                    recipient_code = res_json.get("data", {}).get("recipient_code", "")
                    if recipient_code:
                        account.paystack_recipient_code = recipient_code
                        account.save(update_fields=["paystack_recipient_code"])
                        self.stdout.write(self.style.SUCCESS(f"  OK    {label} → {recipient_code}"))
                        ok += 1
                    else:
                        self.stderr.write(self.style.ERROR(
                            f"  FAIL  {label} — Paystack returned no recipient_code: {res_json.get('data')}"
                        ))
                        failed += 1
                else:
                    self.stderr.write(self.style.ERROR(
                        f"  FAIL  {label} — {res.status_code}: {res_json.get('message', res.text[:200])}"
                    ))
                    failed += 1

            except requests.exceptions.Timeout:
                self.stderr.write(self.style.ERROR(f"  FAIL  {label} — Paystack API timed out"))
                failed += 1
            except Exception as e:
                self.stderr.write(self.style.ERROR(f"  FAIL  {label} — {e}"))
                failed += 1

            time.sleep(delay)

        if not dry_run:
            self.stdout.write("")
            self.stdout.write(f"Done. {ok} succeeded, {failed} failed.")
            if failed:
                self.stdout.write(self.style.WARNING(
                    "Re-run this command to retry failed vendors, or ask them to re-submit their bank details."
                ))
