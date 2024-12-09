import crypto from 'crypto';

export const getThisMonth = (): Date => {
    const now = new Date();
    // UTC -> JST
    now.setHours(now.getUTCHours() + 9, 59, 59, 999);
    // 今月末の日付に変更
    now.setMonth(now.getMonth() + 1);
    now.setDate(0);
    return now;
}

/**
 * 与えられたオブジェクトが有効な日付を含むかどうかを判定します。
 * 
 * @param obj - キーが文字列で値も文字列のオブジェクト。
 * @returns オブジェクトが有効な日付を含む場合は `true`、そうでない場合は `false` を返します。
 * 
 * - キーが 'N' で始まる場合は日付タグではないとみなし、常に `true` を返します。
 * - 正規表現を使用して年、月、日を抽出し、抽出できない場合は `true` を返します。
 * - 月と日が1桁の場合は先頭に '0' を追加します。
 * - 日が指定されていない場合は '01' として扱います。
 * - 抽出した年、月、日を使用して `Date` オブジェクトを作成し、その有効性をチェックします。
 * - 無効な日付の場合は `false` を返します。
 * - 例外が発生した場合は日付タグではないとみなし、 `true` を返します。
 */
export const isValidDate =
    (obj: { [K: string]: string; }): boolean => {
        // no date tag
        if (obj.Key[0] === 'N')
            return true;

        try {
            let { year, month, date } =
                /^(?<year>\d{4})\D?(?<month>\d{1,2})\D?(?<date>\d{0,2})$/
                    .exec(obj.Key)?.groups ?? { year: '', month: '', date: '' };
            if (!year || !month)
                return true;

            if (month.length === 1) {
                month = '0' + month;
            }
            if (date && date.length === 1) {
                date = '0' + date;
            } else if (!date) {
                date = '01';
            }
            const test = new Date(`${year}-${month}-${date}`);
            return !isNaN(test.getTime());
        } catch (e) {
            // 日付タグではない
            return true;
        }
    };

/**
 * 指定されたオブジェクトのキーが今月より前の日付かどうかを判定します。
 *
 * @param obj - キーが日付を表す文字列のオブジェクト。キーは "YYYYMMDD" または "YYYY`記号`MM`記号`DD" の形式である必要があります。
 * @param thisMonth - 判定基準となる現在の月を表す Date オブジェクト。
 * @returns キーの日付が今月以前であれば true、そうでなければ false を返します。
 *
 * @remarks
 * - キーが 'N' で始まる場合は false を返します。
 * - キーが正しい日付形式でない場合や、日付の解析に失敗した場合も false を返します。
 * - 日付が省略されている場合は '01' として扱います。
 */
export const isBeforeThisMonth = (obj: { [K: string]: string; }, thisMonth: Date): boolean => {
    if (obj.Key[0] === 'N')
        return false;

    try {
        let { year, month, date } =
            /^(?<year>\d{4})\D?(?<month>\d{1,2})\D?(?<date>\d{0,2})$/
                .exec(obj.Key)?.groups ?? { year: '', month: '', date: '' };
        if (!year || !month)
            return false;

        if (month.length === 1) {
            month = '0' + month;
        }
        if (date && date.length === 1) {
            date = '0' + date;
        } else if (!date) {
            date = '01';
        }
        const test = new Date(`${year}-${month}-${date}`);
        return test <= thisMonth;
    } catch (e) {
        return false;
    }
};


/**
 * 指定された内容のメッセージを送信します。
 * 
 * @param content - 送信するメッセージの内容
 * @returns メッセージ送信の結果を含むJSONオブジェクト
 * @throws メッセージの送信に失敗した場合にエラーをスローします
 */
export const send_message = async (content: string) => {
    const secret = process.env.DING_SECRET;
    const endpoint = process.env.DING_ENDPOINT ?? '';
    let url = endpoint;

    if (secret) {
        const calcHmac = (time: number) => {
            const sign = `${time}\n${secret}`;
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(sign);
            const digest = hmac.digest('base64');
            return encodeURIComponent(digest);
        }
    
        const now = Date.now();
        url += `&timestamp=${now}&sign=${calcHmac(now)}`;
    }
    const message = {
        "msgtype": "text",
        "text": {
            content
        }
    };

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'charset': 'utf-8',
        },
        body: JSON.stringify(message)
    });

    if (!res.ok) {
        console.error(`Failed to send message: ${res.statusText}`);
        throw new Error(`Failed to send message: ${res.statusText}`);
    }

    const json = await res.json();
    console.log('RESPONSE: \n' + JSON.stringify(json));

    if (json.errcode !== 0) {
        console.error(`Message rejected by endpoint: ${json.errmsg}`);
        throw new Error(`Message rejected by endpoint: ${json.errmsg}`);
    }
    console.log('MESSAGE SENT: \n' + JSON.stringify(message));
    
    return json;
}
