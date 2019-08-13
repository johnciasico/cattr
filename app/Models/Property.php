<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Collection;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * Class Property
 *
 * @package App\Models
 *
 * @property int    $id
 * @property int    $entity_id
 * @property string $entity_type
 * @property string $name
 * @property string $value
 * @property string $created_at
 * @property string $updated_at
 * @property string $deleted_at
 */
class Property extends AbstractModel
{
    use SoftDeletes;

    public const PROJECT_CODE = 'project';
    public const TASK_CODE = 'task';
    public const TIME_INTERVAL_CODE = 'time_interval';
    public const SCREENSHOT_CODE = 'screenshot';
    public const USER_CODE = 'user';

    /**
     * @var string
     */
    protected $table = 'properties';

    /**
     * @var array
     */
    protected $fillable = ['entity_id', 'entity_type', 'name', 'value'];

    public static function getTableName()
    {
        return with(new static)->getTable();
    }

    /**
     * Get property from database
     *
     * @param  string  $scope
     * @param  string  $key
     * @param  array   $parameters
     *
     * @return Collection
     */
    public function getProperty(string $scope, string $key, array $parameters = [])
    {
        // Making data for where query
        $queryData = [
            'entity_type' => $scope,
            'name' => $key
        ];

        if (!empty($parameters)) {
            $queryData = array_merge($queryData, $parameters);
        }

        return $this->where($queryData)->get();
    }
}
