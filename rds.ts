import { DBInstanceNotFoundFault, DescribeDBInstancesCommand, RDSClient, type DescribeDBInstancesCommandOutput, type Tag } from "@aws-sdk/client-rds";
import { ignoreTags, type ResourceDict } from "./constants";
import { isBeforeThisMonth, isValidDate } from "./utility";
import type { Resource } from "@aws-sdk/client-resource-explorer-2";
import { fromEnv } from "@aws-sdk/credential-providers";

export const rdsdblist = async (json: ResourceDict | undefined, resource_type: string, thisMonth: Date): Promise<string> => {
    if (!json || !Object.entries(json).length)
        return `⚠️ ${resource_type}の削除候補を取得できませんでした`;

    let message = `# ${resource_type}の削除`;
    const empty_tag_list = '\n💡タグ無し削除\n';
    const remove_list = '\n💡月末削除\n';
    const over_list = '\n💡期限超過削除\n';
    const error_list = '\n💡エラー日付削除\n';

    /**
     * インスタンスごとにタグチェックを行い削除リストを返す
     * @param resources - チェック対象インスタンス
     * @param list - リストの概要
     * @param checkLogic - タグチェックのロジック
     * @returns 削除対象リスト
     */
    const checkResource = async (resources: Resource[], list: string, checkLogic: (tags: Tag[] | undefined) => boolean | undefined) => {
        let target_found = false;

        // Regionでソートしてインスタンスを順次処理
        for (const r of resources.sort((a, b) => a.Region?.localeCompare(b.Region ?? '') ?? 0)) {
            const region: string = r.Region ?? '';
            let id: string = r.Arn ?? '';
            // arnの末尾`i-[0-9a-z]{8,17}`を取得
            const match = id.match(/i-[0-9a-z]{8,17}$/);
            if (match) id = match[0];

            const command = new DescribeDBInstancesCommand({
                DBInstanceIdentifier: id,
            });
            const rdsClient = new RDSClient({
                credentials: fromEnv(),
                region: region,
            });
            try {
                const res = await rdsClient.send(command);
                res.DBInstances?.forEach(i => {
                    const tags = i.TagList;
                    // 与えられたルールで検証する
                    if (checkLogic(tags)) {
                        target_found = true;
                        const id = i.DBInstanceIdentifier ?? '';
                        list += `💣 Id: ${id}
                        - Region: ${region}
                        - Tags: ${tags?.map(t => '"'+t.Key?.slice(0,28).concat(t.Value && '":"'+(t.Value.slice(0,16))+'"' || '"')).join(',\n      ')}\n`;
                    }
                });
            } catch (error) {
                if (error instanceof DBInstanceNotFoundFault) {
                    console.error(`Instance not found in ${region}: ${id}`);
                } else {
                    console.error(error);
                }
            };
        }

        if (!target_found) {
            list += '💯対象無し\n';
        }
        return list;
    };

    // タグ無し削除
    message += await checkResource(
        json.emptyTag,
        empty_tag_list,
        (tags) => tags?.every(t => ignoreTags.includes(t?.Key ?? ''))
    );

    // 月末削除
    const find_tag = `${thisMonth.getFullYear()}${(thisMonth.getMonth() + 1).toString().padStart(2, '0')}`;
    message += await checkResource(
        json.remove,
        remove_list,
        (tags) => tags?.some(t => t.Key?.indexOf(find_tag) === 0)
    );

    // 期限超過削除
    message += await checkResource(
        json.over,
        over_list,
        (tags) => tags?.some(t => isBeforeThisMonth((t as { [K: string]: string }), thisMonth))
    );

    // エラー日付削除
    message += await checkResource(
        json.error,
        error_list,
        (tags) => tags?.some(t => !isValidDate((t as { [K: string]: string })))
    );

    return message;
}
