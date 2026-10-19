// Reference solution for CD0001 Even Prefixes: count prefixes whose sum is
// even. Only the parity of the running sum matters.
#include <bits/stdc++.h>
using namespace std;

int main() {
    int t;
    if (scanf("%d", &t) != 1) return 0;
    while (t--) {
        int n;
        scanf("%d", &n);
        long long sum = 0;
        int even = 0;
        for (int i = 0; i < n; i++) {
            long long x;
            scanf("%lld", &x);
            sum += x;
            if (sum % 2 == 0) even++;
        }
        printf("%d\n", even);
    }
}
