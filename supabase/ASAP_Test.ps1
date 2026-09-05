Here is a cleaner **200-view/testing script style** you can use:

```powershell
# ============================================
# ASAP PRODUCT 200 VIEW TEST SCRIPT
# ============================================

$BaseUrl = "https://asap-product.com/api"
$Report = @()

function Add-TestResult {
    param (
        [string]$TestName,
        [string]$Status,
        [string]$Message
    )

    $script:Report += [PSCustomObject]@{
        TestName = $TestName
        Status   = $Status
        Message  = $Message
        Time     = Get-Date
    }
}

function Test-View {
    param (
        [int]$TestNo,
        [string]$ViewName,
        [string]$Endpoint
    )

    try {
        $response = Invoke-WebRequest `
            -Uri "$BaseUrl$Endpoint" `
            -Method GET `
            -UseBasicParsing `
            -TimeoutSec 10

        if ($response.StatusCode -eq 200) {
            Add-TestResult "TEST_$TestNo`_$ViewName" "PASS" "View loaded successfully"
        }
        else {
            Add-TestResult "TEST_$TestNo`_$ViewName" "FAIL" "Status code: $($response.StatusCode)"
        }
    }
    catch {
        Add-TestResult "TEST_$TestNo`_$ViewName" "FAIL" $_.Exception.Message
    }
}

# ============================================
# 200 VIEW TEST CASES
# ============================================

$Views = @(
    @{ No = 1; View = "LoginView"; Endpoint = "/login" },
    @{ No = 2; View = "DashboardView"; Endpoint = "/dashboard" },
    @{ No = 3; View = "UserProfileView"; Endpoint = "/users/profile" },
    @{ No = 4; View = "OrdersView"; Endpoint = "/orders" },
    @{ No = 5; View = "ProductsView"; Endpoint = "/products" },
    @{ No = 6; View = "ReportsView"; Endpoint = "/reports" },
    @{ No = 7; View = "SettingsView"; Endpoint = "/settings" },
    @{ No = 8; View = "NotificationsView"; Endpoint = "/notifications" },
    @{ No = 9; View = "SearchView"; Endpoint = "/search" },
    @{ No = 10; View = "HelpView"; Endpoint = "/help" }
)

# Auto-generate remaining tests up to 200
for ($i = 11; $i -le 200; $i++) {
    $Views += @{
        No       = $i
        View     = "ASAP_View_$i"
        Endpoint = "/view/$i"
    }
}

foreach ($view in $Views) {
    Test-View `
        -TestNo $view.No `
        -ViewName $view.View `
        -Endpoint $view.Endpoint
}

# ============================================
# EXPORT REPORT
# ============================================

$Report | Export-Csv ".\ASAP_200_View_Test_Report.csv" -NoTypeInformation
$Report | Format-Table -AutoSize

Write-Host "===================================="
Write-Host "ASAP 200 VIEW TESTING COMPLETED"
Write-Host "Report: ASAP_200_View_Test_Report.csv"
Write-Host "===================================="
```
